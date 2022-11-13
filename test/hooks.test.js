import { expect } from 'chai';
import { createElement } from 'react';
import { withTestRenderer } from './test-renderer.js';

import {
  useRouter
} from '../index.js';

global.location = 'http://example.test/somewhere/';

describe('#useRouter()', function() {
  it('should return a function', async function() {
    await withTestRenderer(async ({ create, toJSON }) => {
      let f;
      function Test() {
        const provide = useRouter();
        f = provide;
        return 'TEST';
      }
      const el = createElement(Test);
      await create(el);
      expect(toJSON()).to.equal('TEST');
      expect(f).to.be.a('function');
    });
  })
  it('should correctly parse the path and query', async function() {
    await withTestRenderer(async ({ create, toJSON }) => {
      let p, q;
      function Test({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          p = parts;
          q = query;
          return 'TEST';
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await create(el);
      expect(toJSON()).to.equal('TEST');
      expect(p).to.eql([ 'hello', 'world' ]);
      expect(q).to.eql({ a: '1', b: '123' });
      expect(Object.keys(p)).to.eql([ '0', '1' ]);
      expect(Object.keys(q)).to.eql([ 'a', 'b' ]);
    });
  })
})
