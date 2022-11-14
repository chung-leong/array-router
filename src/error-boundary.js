import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, fresh: false };
  }

  static getDerivedStateFromProps(props, state) {
    const { error, fresh } = state;
    if (fresh) {
      // render() needs to see this--clear it next time
      return { error, fresh: false };
    } else {
      // clear stale error
      return { error: null };
    }
  }

  static getDerivedStateFromError(error) {
    return { error, fresh: true };
  }

  render() {
    let { error } = this.state;
    if (error) {
      // keep rendering if the error was patched up
      if (this.props.onError(error) === false) {
        error = null;
      }
    }
    return !error ? this.props.children : null;
  }
}
