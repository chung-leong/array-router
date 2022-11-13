export const removing = { '*': NaN };
Object.freeze(removing);

export function arrayProxy(array, descriptors) {
  // verify that the descriptors are correct and ready them for sorting at the same time
  const list = []
  for (const [ name, desc ] of Object.entries(descriptors)) {
    let lowest;
    if (typeof(desc) === 'number') {
      // targetting a single slot
      lowest = desc;
    } else if (desc && typeof(desc) === 'object') {
      if ('$' in desc) {
        // targetting multiple slots: single value plus static strings
        let removingRest = false;
        let highest;
        for (const [ key, index ] of Object.entries(desc)) {
          if (key === '*') {
            removingRest = true;
            continue;
          }
          if ((index|0) !== index || index < 0) {
            lowest = undefined;
            break;
          }
          if (!(lowest <= index)) {
            lowest = index;
          }
          if (!(highest >= index)) {
            highest = index;
          }
        }
        if (removingRest) {
          // update the descriptor with the actual index
          desc['*'] = highest + 1;
        }
      } else if ('get' in desc && 'set' in desc && Object.keys(desc) === '2') {
        // getter/setter
        lowest = Infinity;
      }
    }
    if (lowest === undefined) {
      throw new Error(`Invalid descriptor for property "${name}"`);
    }
    list.push({ name, desc, lowest });
  }
  // sort properties from the earliest to the latest
  list.sort((a, b) => a.lowest - b.lowest);
  descriptors = {};
  for (const { name, desc } of list) {
    descriptors[name] = desc;
  }
  return new Proxy({}, {
    get(_, name) {
      return extractValue.call(this, array, name, descriptors);
    },
    set(_, name, value) {
      return storeValue.call(this, array, name, descriptors, value);
    },
    has(_, name) {
      const value = extractValue.call(this, array, name, descriptors);
      return (value !== undefined);
    },
    ownKeys(_) {
      const list = [];
      for (const name of Object.keys(descriptors)) {
        const value = extractValue.call(this, array, name, descriptors);
        if (value !== undefined) {
          list.push(name);
        }
      }
      return list;
    },
    getOwnPropertyDescriptor(_, name) {
      if (name in descriptors) {
        const value = extractValue.call(this, array, name, descriptors);
        return { value, configurable: true, enumerable: true, writable: true };
      } else {
        return {};
      }
    },
  });
}

function extractValue(array, name, descriptors) {
  const desc = descriptors[name];
  if (typeof(desc) === 'number') {
    return array[desc];
  } else if (typeof(desc) === 'object') {
    if ('$' in desc) {
      let value;
      for (const [ key, index ] of Object.entries(desc)) {
        if (key === '*') {
          // do nothing
        } else if (key === '$') {
          value = array[index];
        } else if (!splitChoices(key).includes(array[index])) {
          value = undefined;
          break;
        }
      }
      return value;
    } else {
      // must be getter/setter
      return desc.get.call(this, array)
    }
  }
}

function storeValue(array, name, descriptors, value) {
  const desc = descriptors[name];
  if (desc === undefined) {
    return false;
  } else if (typeof(desc) === 'number') {
    array[desc] = value;
  } else if (typeof(desc) === 'object') {
    if ('$' in desc) {
      // check to see if static strings are present
      let removingIndex;
      for (const [ key, index ] of Object.entries(desc)) {
        if (key === '*') {
          removingIndex = index;
        } else if (key === '$') {
          array[index] = value;
        } else {
          const [ first ] = splitChoices(key);
          array[index] = first;
        }
      }
      if (removingIndex !== undefined) {
        array.splice(removingIndex);
      }
    } else {
      // must be getter/setter
      desc.set.call(this, array, value);
    }
  }
  return true;
}

function splitChoices(key) {
  return key.split(/\s*\|\s*/);
}
