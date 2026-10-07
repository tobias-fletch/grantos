import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFundingFocus, parseFundingFocus } from '../src/lib/opportunities/funding-focus';
import { parseFilters } from '../src/lib/opportunities/store';
test('funding focus validates, deduplicates and preserves multi-select URL filters', () => {
  assert.deepEqual(parseFundingFocus(['women','lgbtq','women','invalid']), ['women','lgbtq']);
  assert.deepEqual(parseFilters({focus:['women','minorities']}).focus, ['women','minorities']);
});
test('funding focus matches source terms with OR semantics and leaves unknown facts out', () => {
  assert.equal(matchesFundingFocus('Awards for LGBTQIA+ artists', ['lgbtq']), true);
  assert.equal(matchesFundingFocus('Support for women-owned businesses', ['women']), true);
  assert.equal(matchesFundingFocus('Funding for Indigenous researchers', ['minorities']), true);
  assert.equal(matchesFundingFocus('Latina entrepreneurs', ['women','minorities']), true);
  assert.equal(matchesFundingFocus('General project support', ['women']), false);
  assert.equal(matchesFundingFocus('', ['lgbtq','minorities']), false);
  assert.equal(matchesFundingFocus('', []), true);
  assert.equal(matchesFundingFocus('Womanhood arts grant', ['women']), false);
});

test('researched population focus options match specific source language', () => {
  const cases = [
    ['veterans', 'Support for military spouses', 'Veterinary research'],
    ['disabilities', 'Artists with disabilities', 'Accessible application form'],
    ['indigenous', 'Tribal food sovereignty', 'Native plants research'],
    ['immigrants', 'Refugees and asylum seekers', 'Bird migration'],
    ['youth', 'Youth development', 'New organizations'],
    ['older-adults', 'Services for older adults', 'Senior research fellow'],
    ['rural', 'Rural community facilities', 'Urban development'],
    ['low-income', 'Support for low-income families', 'Low application fees'],
  ];
  for (const [focus, positive, negative] of cases) {
    assert.deepEqual(parseFundingFocus(focus), [focus]);
    assert.equal(matchesFundingFocus(positive, [focus]), true, focus);
    assert.equal(matchesFundingFocus(negative, [focus]), false, focus);
    assert.equal(matchesFundingFocus('', [focus]), false, focus);
  }
  assert.equal(matchesFundingFocus('Rural youth programs', ['women', 'youth']), true);
});
