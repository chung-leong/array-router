import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromProps(props) {
    return { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    let { error } = this.state;
    if (error) {
      if (this.props.onError(error) === false) {
        error = null;
      }
    }
    return !error ? this.props.children : null;
  }
}
