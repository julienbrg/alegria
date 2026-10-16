import { parseAskLimits } from './ask-limits';

describe('parseAskLimits', () => {
  it('reads one count per profile', () => {
    expect(parseAskLimits(' Student:30, Super-admin:5 ,Teacher:100')).toEqual({
      Student: 30,
      'Super-admin': 5,
      Teacher: 100,
    });
  });

  it('leaves every profile unlimited when empty', () => {
    expect(parseAskLimits('')).toEqual({});
  });

  it.each([
    ['Guest:3', /unknown profile/],
    ['Student:0', /positive integer/],
    ['Student:2.5', /positive integer/],
    ['Student', /positive integer/],
    ['Student:3:4', /positive integer/],
    ['Student:3,Student:4', /listed twice/],
  ])('refuses %s', (value, error) => {
    expect(() => parseAskLimits(value)).toThrow(error);
  });
});
