import { notFound } from 'next/navigation'
import { TransitCalibrationWorkbench } from '@/components/van-damage/TransitCalibrationWorkbench'

export default function TransitCalibrationPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <TransitCalibrationWorkbench />
}
