import type { ModuleDefinition, ModuleKey } from '@/modules/shared/moduleTypes'

import { paymentsModule }      from '@/modules/payments'
import { appointmentsModule }  from '@/modules/appointments'
import { rewardsModule }       from '@/modules/rewards'
import { vehiclesModule }      from '@/modules/vehicles'
import { damageAiModule }      from '@/modules/damage_ai'
import { leadsModule }         from '@/modules/leads'
import { messagesModule }      from '@/modules/messages'
import { contactsModule }      from '@/modules/contacts'
import { storeModule }         from '@/modules/store'
import { websiteModule }       from '@/modules/website'
import { customersModule }     from '@/modules/customers'
import { spinPackagesModule }  from '@/modules/spin_packages'

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDefinition> = {
  payments:      paymentsModule,
  appointments:  appointmentsModule,
  rewards:       rewardsModule,
  vehicles:      vehiclesModule,
  damage_ai:     damageAiModule,
  leads:         leadsModule,
  messages:      messagesModule,
  contacts:      contactsModule,
  store:         storeModule,
  website:       websiteModule,
  customers:     customersModule,
  spin_packages: spinPackagesModule,
}

export type { ModuleKey, ModuleDefinition }
