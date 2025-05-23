'use strict';

const {
  ArrayPrototypePush,
  Int32Array,
  StringPrototypeEndsWith,
} = primordials;

const colors = require('internal/util/colors');

const kNopLinesToCollapse = 5;
const kOperations = {
  DELETE: -1,
  NOP: 0,
  INSERT: 1,
};

function areLinesEqual(actual, expected, checkCommaDisparity) {
  if (actual === expected) {
    return true;
  }
  if (checkCommaDisparity) {
    return (actual + ',') === expected || actual === (expected + ',');
  }
  return false;
}

function myersDiff(actual, expected, checkCommaDisparity = false) {
  const actualLength = actual.length;
  const expectedLength = expected.length;
  const max = actualLength + expectedLength;
  // TODO(BridgeAR): Cap the input in case the values go beyond the limit of 2^31 - 1.
  const v = new Int32Array(2 * max + 1);
  const trace = [];

  for (let diffLevel = 0; diffLevel <= max; diffLevel++) {
    ArrayPrototypePush(trace, new Int32Array(v)); // Clone the current state of `v`

    for (let diagonalIndex = -diffLevel; diagonalIndex <= diffLevel; diagonalIndex += 2) {
      const offset = diagonalIndex + max;
      const previousOffset = v[offset - 1];
      const nextOffset = v[offset + 1];
      let x = diagonalIndex === -diffLevel || (diagonalIndex !== diffLevel && previousOffset < nextOffset) ?
        nextOffset :
        previousOffset + 1;
      let y = x - diagonalIndex;

      while (
        x < actualLength &&
        y < expectedLength &&
        areLinesEqual(actual[x], expected[y], checkCommaDisparity)
      ) {
        x++;
        y++;
      }

      v[offset] = x;

      if (x >= actualLength && y >= expectedLength) {
        return backtrack(trace, actual, expected, checkCommaDisparity);
      }
    }
  }
}

function backtrack(trace, actual, expected, checkCommaDisparity) {
  const actualLength = actual.length;
  const expectedLength = expected.length;
  const max = actualLength + expectedLength;

  let x = actualLength;
  let y = expectedLength;
  const result = [];

  for (let diffLevel = trace.length - 1; diffLevel >= 0; diffLevel--) {
    const v = trace[diffLevel];
    const diagonalIndex = x - y;
    const offset = diagonalIndex + max;

    let prevDiagonalIndex;
    if (
      diagonalIndex === -diffLevel ||
      (diagonalIndex !== diffLevel && v[offset - 1] < v[offset + 1])
    ) {
      prevDiagonalIndex = diagonalIndex + 1;
    } else {
      prevDiagonalIndex = diagonalIndex - 1;
    }

    const prevX = v[prevDiagonalIndex + max];
    const prevY = prevX - prevDiagonalIndex;

    while (x > prevX && y > prevY) {
      const actualItem = actual[x - 1];
      const value = checkCommaDisparity && !StringPrototypeEndsWith(actualItem, ',') ? expected[y - 1] : actualItem;
      ArrayPrototypePush(result, [ kOperations.NOP, value ]);
      x--;
      y--;
    }

    if (diffLevel > 0) {
      if (x > prevX) {
        ArrayPrototypePush(result, [ kOperations.INSERT, actual[--x] ]);
      } else {
        ArrayPrototypePush(result, [ kOperations.DELETE, expected[--y] ]);
      }
    }
  }

  return result;
}

function printSimpleMyersDiff(diff) {
  let message = '';

  for (let diffIdx = diff.length - 1; diffIdx >= 0; diffIdx--) {
    const { 0: operation, 1: value } = diff[diffIdx];
    let color = colors.white;

    if (operation === kOperations.INSERT) {
      color = colors.green;
    } else if (operation === kOperations.DELETE) {
      color = colors.red;
    }

    message += `${color}${value}${colors.white}`;
  }

  return `\n${message}`;
}

function printMyersDiff(diff, operator) {
  let message = '';
  let skipped = false;
  let nopCount = 0;

  for (let diffIdx = diff.length - 1; diffIdx >= 0; diffIdx--) {
    const { 0: operation, 1: value } = diff[diffIdx];
    const previousOperation = diffIdx < diff.length - 1 ? diff[diffIdx + 1][0] : null;

    // Avoid grouping if only one line would have been grouped otherwise
    if (previousOperation === kOperations.NOP && operation !== previousOperation) {
      if (nopCount === kNopLinesToCollapse + 1) {
        message += `${colors.white}  ${diff[diffIdx + 1][1]}\n`;
      } else if (nopCount === kNopLinesToCollapse + 2) {
        message += `${colors.white}  ${diff[diffIdx + 2][1]}\n`;
        message += `${colors.white}  ${diff[diffIdx + 1][1]}\n`;
      } else if (nopCount >= kNopLinesToCollapse + 3) {
        message += `${colors.blue}...${colors.white}\n`;
        message += `${colors.white}  ${diff[diffIdx + 1][1]}\n`;
        skipped = true;
      }
      nopCount = 0;
    }

    if (operation === kOperations.INSERT) {
      if (operator === 'partialDeepStrictEqual') {
        message += `${colors.gray}${colors.hasColors ? ' ' : '+'} ${value}${colors.white}\n`;
      } else {
        message += `${colors.green}+${colors.white} ${value}\n`;
      }
    } else if (operation === kOperations.DELETE) {
      message += `${colors.red}-${colors.white} ${value}\n`;
    } else if (operation === kOperations.NOP) {
      if (nopCount < kNopLinesToCollapse) {
        message += `${colors.white}  ${value}\n`;
      }
      nopCount++;
    }
  }

  message = message.trimEnd();

  return { message: `\n${message}`, skipped };
}

module.exports = { myersDiff, printMyersDiff, printSimpleMyersDiff };
