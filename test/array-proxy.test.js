import { expect } from 'chai';

import {
  arrayProxy,
  removing,
} from '../index.js';

describe('#arrayProxy()', function() {
  it('should fail when non-array is given', function() {
    expect(() => arrayProxy({}, { a: 1 })).to.throw();
  })
  it('should fail when descriptors are not contain in an object', function() {
    expect(() => arrayProxy([], 5)).to.throw();
  })
  it('should fail when index is negative', function() {
    expect(() => arrayProxy([], { a: -1 })).to.throw();
    expect(() => arrayProxy([], { a: { $:-1 } })).to.throw();
  })
  it('should fail when index is fractional', function() {
    expect(() => arrayProxy([], { a: 1.3 })).to.throw();
  })
  it('should fail when descriptor does match any', function() {
    expect(() => arrayProxy([], { a: {} })).to.throw();
  })
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
  it('should retrieval of property that depends on the presence of a static string', function() {
    const array = [ 'categories', '123' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
      }
    });
    expect(proxy).to.have.property('categoryId', '123');
    expect(proxy).to.eql({ categoryId: '123' });
    expect('categoryId' in proxy).to.be.true;
    expect('nonsense' in proxy).to.be.false;
  })
  it('should yield undefined when required static string is absent', function() {
    const array = [ 'forums', '123' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
      }
    });
    expect(proxy.categoryId).to.be.undefined;
    expect(proxy).to.eql({});
    expect(Object.keys(proxy)).to.eql([]);
    expect('categoryId' in proxy).to.be.false;
  })
  it('should allow the setting of multiple parts', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
      },
      forumId: {
        "forums": 0,
        $: 1,
      },
      messageId: {
        "messages": 2,
        $: 3
      }
    });
    expect(proxy).to.eql({ forumId: '123', messageId: '18' });
    proxy.categoryId = '18';
    expect(array).to.eql([ 'categories', '18', 'messages', '18' ]);
  })
  it('should remove elements behind the specified index when removing is used', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
        ...removing,
      },
      forumId: {
        "forums": 0,
        $: 1,
        ...removing,
      },
      messageId: {
        "messages": 2,
        $: 3
      }
    });
    expect(proxy).to.eql({ forumId: '123', messageId: '18' });
    proxy.categoryId = '18';
    expect(array).to.eql([ 'categories', '18' ]);
  })
  it('should insert static strings triggering the existence of another property', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
        ...removing,
      },
      productId: {
        "products": 2,
        $: 3,
        "summary": 4,
        ...removing,
      },
      productSection: 4,
      forumId: {
        "forums": 0,
        $: 1,
        ...removing,
      },
      messageId: {
        "messages": 2,
        $: 3
      }
    });
    expect(proxy).to.eql({ forumId: '123', messageId: '18' });
    proxy.categoryId = '18';
    expect(array).to.eql([ 'categories', '18' ]);
    proxy.productId = '1234';
    expect(array).to.eql([ 'categories', '18', 'products', '1234', 'summary' ]);
    expect(proxy).to.eql({ categoryId: '18', productId: '1234', productSection: 'summary' });
    proxy.productSection = 'reviews';
    expect(array).to.eql([ 'categories', '18', 'products', '1234', 'reviews' ]);
    // "summary" no longer matches
    expect(proxy).to.not.eql({ categoryId: '18', productId: '1234', productSection: 'reviews' });
  })
  it('should allow the use of a getter', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      home: {
        get: arr => arr.length === 0
      },
    });
    expect(proxy).to.have.property('home', false);
    const descriptor = Object.getOwnPropertyDescriptor(proxy, 'home');
    expect(descriptor).to.have.property('writable', false);
    expect(() => proxy.home = true).to.throw();
  })
  it('should allow the use of a setter', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      home: {
        get: (arr) => arr.length === 0,
        set: (arr, value) => { if (value) arr.splice(0); return true; },
      },
    });
    expect(proxy).to.have.property('home', false);
    const descriptor = Object.getOwnPropertyDescriptor(proxy, 'home');
    expect(descriptor).to.have.property('writable', true);
    proxy.home = true;
    expect(proxy).to.have.property('home', true);
    expect(array).to.eql([]);
  })
  it('should throw when setter returns falsy', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      home: {
        get: (arr) => arr.length === 0,
        set: (arr, value) => { if (value) arr.splice(0) },
      },
    });
    expect(() => proxy.home = true).to.throw();
  })
  it('should not allow the setting of non-existing property', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      home: {
        get: (arr) => arr.length === 0,
        set: (arr, value) => { if (value) arr.splice(0); return true; },
      },
    });
    expect(() => proxy.world = 'Hello').to.throw();
  })
  it('should remove all following parts when a property is deleted', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
        ...removing,
      },
      productId: {
        "products": 2,
        $: 3,
        "summary": 4,
        ...removing,
      },
      forumId: {
        "forums": 0,
        $: 1,
        ...removing,
      },
      messageId: {
        "messages": 2,
        $: 3
      }
    });
    delete proxy.messageId;
    expect(array).to.eql([ 'forums', '123' ]);
    delete proxy.forumId;
    expect(array).to.eql([]);
  })
  it('should remove all following parts when a property is described using a number', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      forumId: 1,
      messageId: 3,
    });
    delete proxy.messageId;
    expect(array).to.eql([ 'forums', '123', 'messages' ]);
    delete proxy.forumId;
    expect(array).to.eql([ 'forums' ]);
  })
  it('should remove all following parts when a property set to undefined', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
        ...removing,
      },
      productId: {
        "products": 2,
        $: 3,
        "summary": 4,
        ...removing,
      },
      forumId: {
        "forums": 0,
        $: 1,
        ...removing,
      },
      messageId: {
        "messages": 2,
        $: 3
      }
    });
    proxy.messageId = undefined;
    expect(array).to.eql([ 'forums', '123' ]);
    proxy.forumId = undefined;
    expect(array).to.eql([]);
  })
  it('should call setter when delete is used', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      forumId: {
        get: (arr) => arr[1],
        set: (arr, value) => {
          if (value === undefined) {
            arr.splice(0);
          }
          return true;
        },
      },
    });
    delete proxy.forumId;
    expect(array).to.eql([]);
  })
  it('should fail when trying to delete property without a descriptor', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
        ...removing,
      },
      productId: {
        "products": 2,
        $: 3,
        "summary": 4,
        ...removing,
      },
      forumId: {
        "forums": 0,
        $: 1,
        ...removing,
      },
      messageId: {
        "messages": 2,
        $: 3
      }
    });
    expect(() => delete proxy.jerk).to.throw();
  })
  it('should fail when trying to delete property with missing static string', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      categoryId: {
        "categories": 0,
        $: 1,
        ...removing,
      },
      productId: {
        "products": 2,
        $: 3,
        "summary": 4,
        ...removing,
      },
      forumId: {
        "forums": 0,
        $: 1,
        ...removing,
      },
      messageId: {
        "messages": 2,
        $: 3
      }
    });
    expect(() => delete proxy.productId).to.throw();
    expect(() => delete proxy.categoryId).to.throw();
  })
  it('should fail when deleting a property with a setter', function() {
    const array = [ 'forums', '123', 'messages', '18' ];
    const proxy = arrayProxy(array, {
      forumId: {
        get: (arr) => arr[1],
      },
    });
    expect(() => delete proxy.forumId).to.throw();
  })
});
