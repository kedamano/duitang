import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icons";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.hash = "#/";
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-page p-4">
          <div className="bg-surface rounded-3xl shadow-xl p-8 max-w-md w-full text-center">
            <Icon name="dizzy" className="w-12 h-12 mx-auto mb-3 text-mute2" />
            <h2 className="text-xl font-bold text-ink mb-2">页面出错了</h2>
            <p className="text-sm text-body2 mb-4 break-all">{this.state.error.message}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={this.handleReset} className="bg-[#e05d6f] text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors">
                回到首页
              </button>
              <button onClick={() => window.location.reload()} className="bg-soft2 text-body text-sm font-medium px-5 py-2.5 rounded-full hover:bg-line2 transition-colors">
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
