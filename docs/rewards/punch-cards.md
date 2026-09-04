# Punch cards

Punch definitions support purchase, appointment, visit, and manual earning; required punches; product/service eligibility; active dates; rolling expiration; repeatability; and reward value.

`apply_reward_punch` validates tenant/customer/definition ownership, rejects duplicate events, updates a customer cycle atomically, appends an event, records analytics, and refreshes Wallet. The customer view uses numbered and checked stamps so completion is not conveyed only by color. Motion is limited to short state feedback and respects reduced-motion preferences.
