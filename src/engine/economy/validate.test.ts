import { describe, expect, test } from 'vitest'
import type { Content, Sourced } from '../../content/build'
import type {
  AnimalDef,
  MarketRule,
  PersonRole,
  ProducerRule,
  ServiceRole,
} from '../../schema/economy'
import { fixtureContent } from '../test-fixtures'
import { economyIssues } from './validate'

const sourced = <T>(entry: T): Sourced<T> => ({ ...entry, source: 'claude', file: 'test.json' })

const role = (id: string, over: Partial<ServiceRole> = {}): Sourced<ServiceRole> =>
  sourced({ id, function: 'trade', trades: [], buysOnly: [], actions: [], ...over })

/** The fixture, completed so that it has no issues: every service gets a role. */
function cleanContent(): Content {
  const content = fixtureContent()
  content.serviceRoles.port = role('port', {
    function: 'hire',
    trades: ['timber', 'stone', 'metal'],
    actions: ['passage', 'market'],
  })
  content.serviceRoles['magic-items'] = role('magic-items', {
    function: 'temple',
    trades: ['healing', 'alchemicals', 'arcana', 'arms', 'armour'],
    actions: ['market'],
  })
  return content
}

describe('economyIssues', () => {
  test('the completed fixture is clean', () => {
    expect(economyIssues(cleanContent())).toEqual([])
  })

  test('reports a missing good', () => {
    const content = cleanContent()
    delete content.goods.metal
    expect(economyIssues(content)).toContain('goods: "metal" is not defined')
  })

  test('reports a service without a role, and a role for an unknown service', () => {
    const content = cleanContent()
    delete content.serviceRoles.port
    content.serviceRoles.ghost = role('ghost')
    const issues = economyIssues(content)
    expect(issues).toContain('service port has no serviceRoles entry')
    expect(issues).toContain('serviceRoles ghost: unknown service')
  })

  test('reports a non-essential good that no service trades or buys', () => {
    const content = cleanContent()
    content.serviceRoles.port = role('port', {
      function: 'hire',
      trades: ['timber', 'stone'],
      actions: ['passage', 'market'],
    })
    expect(economyIssues(content)).toContain('goods: no service trades or buys "metal"')
  })

  test('essentials need no service: the market stalls sell them', () => {
    const content = cleanContent()
    content.serviceRoles['adventuring-supplies'] = role('adventuring-supplies', {
      trades: ['gear'],
      actions: ['market'],
    })
    expect(economyIssues(content)).toEqual([])
  })

  test('reports unknown animal, service and settlement-type references', () => {
    const content = cleanContent()
    content.animals.cart = { ...content.animals.cart, needs: 'ox' } as Sourced<AnimalDef>
    content.personRoles.priest = sourced<PersonRole>({
      id: 'priest',
      name: 'priest',
      service: 'church',
      minSize: 0,
      weight: 1,
      titles: [],
    })
    content.marketRules.forts = sourced<MarketRule>({
      id: 'forts',
      label: 'Forts',
      when: { types: ['keep'] },
      demand: { arms: 1 },
    })
    content.contracts['bring-timber'] = {
      ...content.contracts['bring-timber'],
      service: 'lumberyard',
    }
    const issues = economyIssues(content)
    expect(issues).toContain('animals cart: needs unknown animal "ox"')
    expect(issues).toContain('personRoles priest: unknown service "church"')
    expect(issues).toContain('marketRules forts: unknown settlement type "keep"')
    expect(issues).toContain('contracts bring-timber: unknown service "lumberyard"')
  })

  test("reports a contract placeholder its kind can't fill", () => {
    const content = cleanContent()
    const template = content.contracts['bring-timber']
    content.contracts['bring-timber'] = { ...template, text: '{Patron} wants {good} at {site}.' }
    expect(economyIssues(content)).toEqual([
      `contracts bring-timber: {site} doesn't fit a ${template.kind} contract`,
    ])
  })

  test('reports a market action without goods, goods without one, and water in trade', () => {
    const content = cleanContent()
    content.serviceRoles.port = role('port', {
      function: 'hire',
      trades: ['timber', 'stone', 'metal', 'water'],
      actions: ['passage'],
    })
    content.serviceRoles['inn-tavern'] = role('inn-tavern', {
      function: 'rest',
      actions: ['lodging', 'market'],
    })
    content.marketRules.coast = sourced<MarketRule>({
      id: 'coast',
      label: 'Coast',
      when: { coastal: true },
      demand: { water: 1 },
    })
    const issues = economyIssues(content)
    expect(issues).toContain('serviceRoles port: trades goods but has no "market" action')
    expect(issues).toContain('serviceRoles inn-tavern: has a "market" action but no goods')
    expect(issues).toContain('serviceRoles port: water is free and never traded')
    expect(issues).toContain('marketRules coast: water is free and never traded')
  })

  test('reports a good both traded and bought-only, and an empty rule', () => {
    const content = cleanContent()
    content.serviceRoles['jewelry-trader'] = role('jewelry-trader', {
      trades: ['gems', 'luxuries', 'relics'],
      buysOnly: ['relics'],
      actions: ['market'],
    })
    content.marketRules.idle = sourced<MarketRule>({
      id: 'idle',
      label: 'Idle',
      when: { coastal: false },
      demand: {},
    })
    const issues = economyIssues(content)
    expect(issues).toContain('serviceRoles jewelry-trader: "relics" is in both trades and buysOnly')
    expect(issues).toContain('marketRules idle: changes no demand')
  })

  test('reports a hired animal that carries no rider, and a vehicle drawing itself', () => {
    const content = cleanContent()
    content.animals.mule = { ...content.animals.mule, hirePerDay: 1 }
    content.animals.cart = { ...content.animals.cart, needs: 'cart' }
    const issues = economyIssues(content)
    expect(issues).toContain('animals mule: only riding animals are hired (hirePerDay needs rider)')
    expect(issues).toContain('animals cart: cannot need itself')
  })

  test('reports a rule whose size range is empty', () => {
    const content = cleanContent()
    content.marketRules.odd = sourced<MarketRule>({
      id: 'odd',
      label: 'Odd',
      when: { minSize: 4, maxSize: 2 },
      demand: { food: 1 },
    })
    expect(economyIssues(content)).toContain('marketRules odd: minSize is above maxSize')
  })

  test('reports a good no producer makes, and a producer of water or of nothing', () => {
    const content = cleanContent()
    content.producers = Object.fromEntries(
      Object.entries(content.producers).filter(([, r]) => !('gems' in r.output))
    )
    content.producers.well = sourced<ProducerRule>({
      id: 'well',
      label: 'Wells',
      when: {},
      output: { water: 1 },
    })
    content.producers.idle = sourced<ProducerRule>({
      id: 'idle',
      label: 'Idle',
      when: {},
      output: {},
    })
    const issues = economyIssues(content)
    expect(issues).toContain('goods: no producer makes "gems"')
    expect(issues).toContain('producers well: water is free and never traded')
    expect(issues).toContain('producers idle: makes nothing')
  })
})
