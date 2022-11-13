import { expect } from 'chai';

import {
  arrayProxy,
  removing,
} from '../index.js';

describe('#arrayProxy()', function() {
  it('should allow array elements to be read by name', function() {
    const array = [ 'alfa', 'bravo', 'charlie', 'delta' ];
    const proxy = arrayProxy(array, {
      third: 2,
      first: 0,
    });
    expect(proxy.first).to.equal('alfa');
    expect(proxy.third).to.equal('charlie');
  })
  it('should yield the correct keys in the most simple case', function() {
    const array = [ 'alfa', 'bravo', 'charlie', 'delta' ];
    const proxy = arrayProxy(array, {
      third: 2,
      first: 0,
    });
    const keys = Object.keys(proxy);
    expect(keys).to.eql([ 'first', 'third' ]);
  })
  it('should work correctly with Object.values', function() {
    const array = [ 'alfa', 'bravo', 'charlie', 'delta' ];
    const proxy = arrayProxy(array, {
      third: 2,
      first: 0,
    });
    const values = Object.values(proxy);
    expect(values).to.eql([ 'alfa', 'charlie' ]);
  })
  it('should work correctly with Object.entries', function() {
    const array = [ 'alfa', 'bravo', 'charlie', 'delta' ];
    const proxy = arrayProxy(array, {
      third: 2,
      first: 0,
    });
    const entries = [];
    for (const entry of Object.entries(proxy)) {
      entries.push(entry);
    }
    expect(entries).to.eql([ [ 'first', 'alfa' ] , [ 'third', 'charlie' ] ]);
  })
  it('should allow assignment to array by name', function() {
    const array = [ 'alfa', 'bravo', 'charlie', 'delta' ];
    const proxy = arrayProxy(array, {
      third: 2,
      first: 0,
    });
    proxy.first = 'able';
    proxy.third = 'castle';
    expect(array).to.eql([ 'able', 'bravo', 'castle', 'delta' ]);
  })
});
