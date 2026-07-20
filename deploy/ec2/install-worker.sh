#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly SERVICE_SOURCE="${REPO_ROOT}/deploy/systemd/van-damage-worker.service"
readonly ENV_SOURCE="${SCRIPT_DIR}/van-damage-worker.env.example"
readonly SERVICE_DEST="/etc/systemd/system/van-damage-worker.service"
readonly ENV_DIR="/etc/nexoranow"
readonly ENV_DEST="${ENV_DIR}/van-damage-worker.env"
readonly APP_ROOT="/opt/nexoranow"
readonly LOG_DIR="/var/log/nexoranow/van-damage-worker"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

for required_file in "${SERVICE_SOURCE}" "${ENV_SOURCE}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Required file not found: ${required_file}" >&2
    exit 1
  fi
done

install_node_lts() {
  local setup_script
  setup_script="$(mktemp)"

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git gnupg unzip
    curl --fail --silent --show-error --location https://deb.nodesource.com/setup_lts.x --output "${setup_script}"
    bash "${setup_script}"
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates git unzip
    command -v curl >/dev/null
    curl --fail --silent --show-error --location https://rpm.nodesource.com/setup_lts.x --output "${setup_script}"
    bash "${setup_script}"
    dnf install -y nodejs
  else
    echo "Unsupported Linux distribution: apt-get or dnf is required." >&2
    rm -f "${setup_script}"
    exit 1
  fi

  rm -f "${setup_script}"
}

install_aws_cli() {
  local architecture aws_arch temp_dir
  architecture="$(uname -m)"
  case "${architecture}" in
    x86_64) aws_arch="x86_64" ;;
    aarch64|arm64) aws_arch="aarch64" ;;
    *)
      echo "Unsupported architecture for AWS CLI: ${architecture}" >&2
      exit 1
      ;;
  esac

  temp_dir="$(mktemp -d)"
  curl --fail --silent --show-error --location \
    "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip" \
    --output "${temp_dir}/awscliv2.zip"
  unzip -q "${temp_dir}/awscliv2.zip" -d "${temp_dir}"
  "${temp_dir}/aws/install" --update
  rm -rf "${temp_dir}"
}

install_node_lts
install_aws_cli

command -v git >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
command -v aws >/dev/null

if ! getent group nexoranow >/dev/null; then
  groupadd --system nexoranow
fi
if ! id --user nexoranow >/dev/null 2>&1; then
  nologin_shell="$(command -v nologin || true)"
  if [[ -z "${nologin_shell}" ]]; then
    nologin_shell="/sbin/nologin"
  fi
  useradd --system --gid nexoranow --home-dir "${APP_ROOT}" --no-create-home --shell "${nologin_shell}" nexoranow
fi

install -d -o nexoranow -g nexoranow -m 0755 "${APP_ROOT}"
install -d -o nexoranow -g nexoranow -m 0755 "${LOG_DIR}"
install -d -o root -g nexoranow -m 0750 "${ENV_DIR}"
install -o root -g root -m 0644 "${SERVICE_SOURCE}" "${SERVICE_DEST}"

if [[ ! -f "${ENV_DEST}" ]]; then
  install -o root -g nexoranow -m 0640 "${ENV_SOURCE}" "${ENV_DEST}"
  echo "Created ${ENV_DEST}; replace every placeholder before starting the worker."
else
  echo "Preserved existing ${ENV_DEST}."
fi

systemctl daemon-reload
systemctl enable van-damage-worker.service

echo "Worker host installation completed."
echo "Next: configure ${ENV_DEST}, then run deploy/ec2/deploy-worker.sh as root."
