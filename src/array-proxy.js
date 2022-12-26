export const removing = { '\b': '...' };
Object.freeze(removing);

export function arrayProxy(array, descriptors) {
  if (!Array.isArray(array) || !descriptors || typeof(descriptors) !== 'object') {
    throw new TypeError('Invalid argument');
  }
  // verify that the descriptors are correct and ready them for sorting at the same time
  const list = []
  for (const [ name, desc ] of Object.entries(descriptors)) {
    let lowest;
    if (typeof(desc) === 'number') {
      // targetting a single slot
      if ((desc|0) === desc && desc >= 0) {
        lowest = desc;
      }
    } else if (desc && typeof(desc) === 'object') {
      if ('$' in desc) {
        // targetting multiple slots: single value plus static strings
        for (const [ key, index ] of Object.entries(desc)) {
          if (key === '\b') {
            continue;
          }
          if ((index|0) === index && index >= 0) {
            if (!(lowest <= index)) {
              lowest = index;
            }
          } else {
            lowest = undefined;
            break;
          }
        }
      } else if ('get' in desc) {
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
    getOwnPropertyDescriptor(_, name) {
      const desc = descriptors[name];
      let value, configurable = true, enumerable = true, writable = true;
      if (desc === undefined) {
        return undefined;
      } else if (typeof(desc) === 'number') {
        value = array[desc];
      } else if (typeof(desc) === 'object') {
        if ('$' in desc) {
          for (const [ key, index ] of Object.entries(desc)) {
            if (key === '\b') {
              continue;
            }
            if (key === '$') {
              value = array[index];
            } else if (array[index] !== key) {
              value = undefined;
              break;
            }
          }
        } else {
          // must be getter
          value = desc.get.call(this, array);
          writable = 'set' in desc;
        }
      }
      return (value !== undefined ) ? { value, configurable, enumerable, writable } : undefined;
    },
    get(_, name) {
      const desciptor = this.getOwnPropertyDescriptor(_, name);
      return desciptor?.value;
    },
    set(_, name, value) {
      if (value === undefined ){
        return this.deleteProperty(_, name);
      }
      const desc = descriptors[name];
      if (desc === undefined) {
        return false;
      } else if (typeof(desc) === 'number') {
        array[desc] = value;
      } else if (typeof(desc) === 'object') {
        if ('$' in desc) {
          // check to see if static strings are present
          let removing = false;
          let highest;
          for (const [ key, index ] of Object.entries(desc)) {
            if (key === '\b') {
              removing = true;
              continue;
            }
            if (key === '$') {
              array[index] = value;
            } else {
              array[index] = key;
            }
            if (!(highest >= index)) {
              highest = index;
            }
          }
          if (removing) {
            array.splice(highest + 1);
          }
        } else if (desc.set) {
          return desc.set.call(this, array, value);
        } else {
          return false;
        }
      }
      return true;
    },
    deleteProperty(_, name) {
      const desc = descriptors[name];
      let indices = [];
      if (desc === undefined) {
        return false;
      } else if (typeof(desc) === 'number') {
        indices.push(desc);
      } else if (typeof(desc) === 'object') {
        if ('$' in desc) {
          for (const [ key, index ] of Object.entries(desc)) {
            if (key === '\b') {
              continue;
            }
            if (key !== '$' && array[index] !== key) {
              return false;
            }
            indices.push(index);
          }
        } else if (desc.set) {
          return desc.set.call(this, array, undefined);
        } else {
          return false;
        }
      }
      const lowest = Math.min(...indices);
      array.splice(lowest);
      return true;
    },
    has(_, name) {
      return !!this.getOwnPropertyDescriptor(_, name);
    },
    ownKeys(_) {
      return Object.keys(descriptors).filter(name => this.has(_, name));
    },
  });
}
