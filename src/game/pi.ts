/**
 * Pi — a "copy the pattern" memory game, like Google's calculator Easter egg.
 *
 * The calculator flashes the digits of π at you one at a time — 3, 1, 4, 1, 5,
 * 9 … — and you copy the sequence back on the keypad. Each round it adds one
 * more digit, so the pattern you have to remember keeps growing. You don't need
 * to know π: you just watch, then repeat.
 */

// π to 200 decimal places (so the pattern has plenty of room to grow into).
const DECIMALS =
  '14159265358979323846264338327950288419716939937510' +
  '58209749445923078164062862089986280348253421170679' +
  '82148086513282306647093844609550582231725359408128' +
  '48111745028410270193852110555964462294895493038196';

/** Every digit of π in order, no decimal point: "3", "1", "4", "1", "5", "9" … */
export const PI_DIGITS = `3${DECIMALS}`;

/** Format the first `n` digits the way a calculator shows them: "3", "3.1", "3.14" … */
export const formatPi = (n: number) => {
  if (n <= 0) return '';
  if (n === 1) return '3';
  return `3.${PI_DIGITS.slice(1, n)}`;
};
