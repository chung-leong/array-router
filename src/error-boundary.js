import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err) {
    return { error: this.props.errorFilter(err) };
  }

  componentDidCatch() {
    if (this.state.error) {
      this.props.onError(this.state.error);
    }
  }

  render() {
    return !this.state.error ? this.props.children : null;
  }
}
