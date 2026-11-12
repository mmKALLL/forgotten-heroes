import { sortedEntries, type Content } from '../../content/build'
import { GOOD_CATEGORY, GOODS, type ContractKind, type Good } from '../../schema/types'
import { slotNames } from '../encounters/slots'

/** Water is refilled free in every settlement, so no shop or market rule may deal in it. */
const FREE: Good = 'water'

/** The placeholders a contract's title and text may use, by kind ({Patron} capitalises). */
export const CONTRACT_PLACEHOLDERS: Readonly<Record<ContractKind, readonly string[]>> = {
  courier: ['patron', 'dest', 'good', 'amount'],
  freight: ['patron', 'dest', 'good', 'amount'],
  procurement: ['patron', 'good', 'amount', 'source'],
  escort: ['patron', 'dest'],
  bounty: ['patron', 'site'],
  errand: ['patron', 'site'],
}

/**
 * Problems with the economy data (Plan 4) that the schemas can't see: missing goods, services
 * without a role, goods nobody deals in, unknown references, and roles or rules that can't do
 * what they say. Duplicate ids are already reported when the content is built.
 */
export function economyIssues(content: Content): string[] {
  const issues: string[] = []
  const { goods, services, serviceRoles, marketRules, producers, animals, personRoles, contracts } =
    content
  const { settlementTypes } = content

  for (const good of GOODS) {
    if (!Object.hasOwn(goods, good)) issues.push(`goods: "${good}" is not defined`)
  }

  for (const service of sortedEntries(services)) {
    if (!Object.hasOwn(serviceRoles, service.id)) {
      issues.push(`service ${service.id} has no serviceRoles entry`)
    }
  }
  const dealtIn = new Set<Good>()
  for (const role of sortedEntries(serviceRoles)) {
    const at = `serviceRoles ${role.id}`
    if (!Object.hasOwn(services, role.id)) issues.push(`${at}: unknown service`)
    for (const good of role.trades) dealtIn.add(good)
    for (const good of role.buysOnly) dealtIn.add(good)
    const both = role.trades.filter((good) => role.buysOnly.includes(good))
    for (const good of both) issues.push(`${at}: "${good}" is in both trades and buysOnly`)
    const dealsInGoods = role.trades.length + role.buysOnly.length > 0
    const market = role.actions.includes('market')
    if (dealsInGoods && !market) issues.push(`${at}: trades goods but has no "market" action`)
    if (market && !dealsInGoods) issues.push(`${at}: has a "market" action but no goods`)
    if (role.trades.includes(FREE) || role.buysOnly.includes(FREE)) {
      issues.push(`${at}: water is free and never traded`)
    }
  }
  for (const good of GOODS) {
    if (GOOD_CATEGORY[good] !== 'essentials' && !dealtIn.has(good)) {
      issues.push(`goods: no service trades or buys "${good}"`)
    }
  }

  const placeIssues = (
    at: string,
    when: { types?: string[]; minSize?: number; maxSize?: number }
  ) => {
    for (const type of when.types ?? []) {
      if (!Object.hasOwn(settlementTypes, type)) {
        issues.push(`${at}: unknown settlement type "${type}"`)
      }
    }
    if (when.minSize !== undefined && when.maxSize !== undefined && when.minSize > when.maxSize) {
      issues.push(`${at}: minSize is above maxSize`)
    }
  }
  for (const rule of sortedEntries(marketRules)) {
    const at = `marketRules ${rule.id}`
    placeIssues(at, rule.when)
    if (Object.values(rule.demand).every((level) => !level)) {
      issues.push(`${at}: changes no demand`)
    }
    if (FREE in rule.demand) issues.push(`${at}: water is free and never traded`)
  }
  const made = new Set<Good>()
  for (const rule of sortedEntries(producers)) {
    const at = `producers ${rule.id}`
    placeIssues(at, rule.when)
    const goods = Object.keys(rule.output) as Good[]
    if (goods.length === 0) issues.push(`${at}: makes nothing`)
    if (FREE in rule.output) issues.push(`${at}: water is free and never traded`)
    for (const good of goods) made.add(good)
  }
  for (const good of GOODS) {
    if (good !== FREE && !made.has(good)) issues.push(`goods: no producer makes "${good}"`)
  }

  for (const animal of sortedEntries(animals)) {
    const at = `animals ${animal.id}`
    if (animal.needs === animal.id) issues.push(`${at}: cannot need itself`)
    else if (animal.needs !== undefined && !Object.hasOwn(animals, animal.needs)) {
      issues.push(`${at}: needs unknown animal "${animal.needs}"`)
    }
    if (animal.hirePerDay !== undefined && !animal.rider) {
      issues.push(`${at}: only riding animals are hired (hirePerDay needs rider)`)
    }
  }

  for (const role of sortedEntries(personRoles)) {
    if (role.service !== undefined && !Object.hasOwn(services, role.service)) {
      issues.push(`personRoles ${role.id}: unknown service "${role.service}"`)
    }
  }
  for (const template of sortedEntries(contracts)) {
    if (template.service !== undefined && !Object.hasOwn(services, template.service)) {
      issues.push(`contracts ${template.id}: unknown service "${template.service}"`)
    }
    const allowed = CONTRACT_PLACEHOLDERS[template.kind]
    for (const name of slotNames(`${template.title} ${template.text}`)) {
      if (!allowed.includes(name)) {
        issues.push(`contracts ${template.id}: {${name}} doesn't fit a ${template.kind} contract`)
      }
    }
  }
  return issues
}
