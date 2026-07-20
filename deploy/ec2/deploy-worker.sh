#!/usr/bin/env bash
set -Eeuo pipefail

readonly SERVICE="van-damage-worker.service"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly WORKER_SOURCE="${REPO_ROOT}/workers/van-damage-worker"
readonly APP_ROOT="/opt/nexoranow"
readonly APP_DIR="${APP_ROOT}/van-damage-worker"
readonly RELEASES_DIR="${APP_ROOT}/releases"
readonly RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
readonly BACKUP_DIR="${RELEASES_DIR}/van-damage-worker-${RELEASE_ID}"
readonly NEW_RELEASE="${APP_ROOT}/.van-damage-worker-new.$$"
readonly OLD_RELEASE="${APP_ROOT}/.van-damage-worker-old.$$"

build_root=""
build_worker=""
was_active=0
swapped=0

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this deployment as root." >&2
  exit 1
fi
if [[ ! -f "${WORKER_SOURCE}/package-lock.json" || ! -d "${REPO_ROOT}/lib" ]]; then
  echo "Run this script from a complete NexoraNow repository checkout." >&2
  exit 1
fi
if [[ ! -f /etc/nexoranow/van-damage-worker.env ]]; then
  echo "Missing /etc/nexoranow/van-damage-worker.env." >&2
  exit 1
fi
if grep -Eq 'replace-with|your-project' /etc/nexoranow/van-damage-worker.env; then
  echo "The worker environment file still contains placeholder values." >&2
  exit 1
fi
if ! id --user nexoranow >/dev/null 2>&1; then
  echo "Missing nexoranow system user; run install-worker.sh first." >&2
  exit 1
fi

build_root="$(mktemp -d "${APP_ROOT}/.van-damage-build.XXXXXX")"
build_worker="${build_root}/workers/van-damage-worker"

cleanup() {
  local status=$?
  trap - EXIT

  if [[ "${status}" -ne 0 ]]; then
    echo "Deployment failed; restoring the previous service state." >&2
    if [[ "${swapped}" -eq 1 && -d "${OLD_RELEASE}" ]]; then
      if [[ -d "${APP_DIR}" ]]; then
        mv "${APP_DIR}" "${APP_ROOT}/failed-van-damage-worker-${RELEASE_ID}"
      fi
      mv "${OLD_RELEASE}" "${APP_DIR}"
    fi
    if [[ "${was_active}" -eq 1 && -d "${APP_DIR}" ]]; then
      systemctl start "${SERVICE}" || true
    fi
  fi

  if [[ -n "${build_root}" ]]; then
    rm -rf "${build_root}"
  fi
  rm -rf "${NEW_RELEASE}"
  exit "${status}"
}
trap cleanup EXIT

if systemctl is-active --quiet "${SERVICE}"; then
  was_active=1
fi

echo "Stopping ${SERVICE}..."
systemctl stop "${SERVICE}"

install -d -o root -g root -m 0755 "${RELEASES_DIR}"
if [[ -d "${APP_DIR}" ]]; then
  echo "Backing up the previous release to ${BACKUP_DIR}..."
  cp -a "${APP_DIR}" "${BACKUP_DIR}"
fi

echo "Copying worker sources into an isolated build directory..."
install -d -m 0755 "${build_worker}"
cp -a "${WORKER_SOURCE}/src" "${build_worker}/src"
cp -a "${WORKER_SOURCE}/scripts" "${build_worker}/scripts"
cp -a "${WORKER_SOURCE}/package.json" "${WORKER_SOURCE}/package-lock.json" \
  "${WORKER_SOURCE}/tsconfig.json" "${WORKER_SOURCE}/tsup.config.ts" "${build_worker}/"
cp -a "${REPO_ROOT}/lib" "${build_root}/lib"

echo "Installing build dependencies..."
npm --prefix "${build_worker}" ci

echo "Building worker..."
npm --prefix "${build_worker}" run build

test -s "${build_worker}/dist/index.js"
test -s "${build_worker}/dist/health.js"
node --check "${build_worker}/dist/index.js"
node --check "${build_worker}/dist/health.js"
echo "Build verification passed."

install -d -m 0755 "${NEW_RELEASE}"
cp -a "${build_worker}/dist" "${NEW_RELEASE}/dist"
cp -a "${build_worker}/package.json" "${build_worker}/package-lock.json" "${NEW_RELEASE}/"

echo "Installing production dependencies..."
npm --prefix "${NEW_RELEASE}" ci --omit=dev --ignore-scripts
chown -R nexoranow:nexoranow "${NEW_RELEASE}"

if [[ -d "${APP_DIR}" ]]; then
  mv "${APP_DIR}" "${OLD_RELEASE}"
fi
mv "${NEW_RELEASE}" "${APP_DIR}"
swapped=1

echo "Starting ${SERVICE}..."
systemctl start "${SERVICE}"
systemctl enable "${SERVICE}"
systemctl status "${SERVICE}" --no-pager --full

if [[ -d "${OLD_RELEASE}" ]]; then
  rm -rf "${OLD_RELEASE}"
fi
swapped=0

echo "Deployment completed successfully."
