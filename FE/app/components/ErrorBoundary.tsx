import React from "react";

type Props = {
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

type State = { hasError: boolean; error?: any };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    // 콘솔에서 에러 스택 확인 가능
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            문제가 발생했습니다. 콘솔에서 에러 메시지를 확인하세요.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
