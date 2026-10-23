import { Component, type ErrorInfo, type ReactNode } from "react";

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
        <div className="min-h-screen flex items-center justify-center bg-[#f8f8f8] p-4">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center">
            <div className="text-5xl mb-3">😵</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">页面出错了</h2>
            <p className="text-sm text-gray-500 mb-4 break-all">{this.state.error.message}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={this.handleReset} className="bg-[#e05d6f] text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors">
                回到首页
              </button>
              <button onClick={() => window.location.reload()} className="bg-gray-100 text-gray-600 text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-200 transition-colors">
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
