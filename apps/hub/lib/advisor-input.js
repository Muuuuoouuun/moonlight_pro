import { LEGEND_CARDS } from '../components/hub/council-legends.js';
import { GURU_CARDS } from '@com-moon/guru-guidance';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const optional = (value, validate) => value === undefined || value === null || validate(value);
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');

function legendIds(value) {
  return Array.isArray(value) && new Set(value).size === value.length && value.every(id => typeof id === 'string' && Object.hasOwn(LEGEND_CARDS, id));
}

function values(value) {
  return plain(value)
    && ['coreValues', 'acceptableCosts', 'pivotConditions', 'tradeOffRules'].every(key => optional(value[key], strings))
    && optional(value.legendIds, legendIds);
}

function knowledge(value) {
  return plain(value)
    && optional(value.domain, domain => ['classin-sales', 'personal-brand', 'general'].includes(domain))
    && ['facts', 'playbooks', 'rules', 'forbidden'].every(key => optional(value[key], strings))
    && optional(value.retrievedSnippets, snippets => Array.isArray(snippets) && snippets.every(item => plain(item)
      && typeof item.title === 'string' && typeof item.snippet === 'string'
      && optional(item.id, id => typeof id === 'string')
      && optional(item.source, source => typeof source === 'string')));
}

export function isGuidanceCardForDomain(id, allowedDomains) {
  return typeof id === 'string'
    && Array.isArray(allowedDomains)
    && GURU_CARDS.some(card => card.id === id && allowedDomains.includes(card.domain));
}

// The write guard bounds the complete JSON body. Preserve extension metadata, but
// validate every field the Engine formatter consumes before any context read/call.
export function isValidAdvisorInput(input) {
  return plain(input)
    && optional(input.guidanceId, id => typeof id === 'string' && GURU_CARDS.some(card => card.id === id))
    && optional(input.legendIds, legendIds)
    && optional(input.values, values)
    && optional(input.knowledge, knowledge)
    && optional(input.directives, directives => plain(directives)
      && optional(directives.values, values)
      && optional(directives.knowledge, knowledge));
}
