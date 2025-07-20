//=============================================================================
// 🔄 バックグラウンド処理監視システム v2
// @description 重い処理の検知と進行状況表示
// @version 2.0.0
//=============================================================================

(() => {
    'use strict';

    class BackgroundProcessMonitor {
        constructor() {
            this.activeProcesses = new Map(); // アクティブな処理を追跡
            this.processCounter = 0; // プロセスID生成用
            this.isMonitoring = false;
            this.ui = null;
            this.updateInterval = null;
            this.performanceThreshold = 1000; // 1秒以上の処理を監視対象とする
            
            this._initializeUI();
            this._setupGlobalHooks();
        }

        /**
         * UI要素を初期化
         */
        _initializeUI() {
            // プログレス表示用のオーバーレイを作成
            this.ui = {
                overlay: this._createOverlay(),
                container: this._createContainer(),
                header: this._createHeader(),
                processesContainer: this._createProcessesContainer(),
                footer: this._createFooter()
            };

            // DOM構造を組み立て
            this.ui.container.appendChild(this.ui.header);
            this.ui.container.appendChild(this.ui.processesContainer);
            this.ui.container.appendChild(this.ui.footer);
            this.ui.overlay.appendChild(this.ui.container);
            
            // bodyに追加（非表示状態）
            document.body.appendChild(this.ui.overlay);
        }

        /**
         * オーバーレイ要素を作成
         */
        _createOverlay() {
            const overlay = document.createElement('div');
            overlay.id = 'background-process-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.3);
                display: none;
                z-index: 10000;
                backdrop-filter: blur(2px);
                transition: all 0.3s ease;
            `;
            return overlay;
        }

        /**
         * メインコンテナを作成
         */
        _createContainer() {
            const container = document.createElement('div');
            container.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
                min-width: 400px;
                max-width: 600px;
                max-height: 80vh;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: fadeInScale 0.3s ease;
            `;
            
            // アニメーション定義をheadに追加
            if (!document.getElementById('bg-process-animations')) {
                const style = document.createElement('style');
                style.id = 'bg-process-animations';
                style.textContent = `
                    @keyframes fadeInScale {
                        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
                        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    }
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                    }
                `;
                document.head.appendChild(style);
            }
            
            return container;
        }

        /**
         * ヘッダー部分を作成
         */
        _createHeader() {
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                border-radius: 12px 12px 0 0;
            `;
            header.innerHTML = `
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">
                    🔄 処理実行中
                </div>
                <div style="font-size: 14px; opacity: 0.9;">
                    バックグラウンドで処理が実行されています
                </div>
            `;
            return header;
        }

        /**
         * プロセス一覧コンテナを作成
         */
        _createProcessesContainer() {
            const container = document.createElement('div');
            container.style.cssText = `
                max-height: 300px;
                overflow-y: auto;
                padding: 0;
            `;
            return container;
        }

        /**
         * フッター部分を作成
         */
        _createFooter() {
            const footer = document.createElement('div');
            footer.style.cssText = `
                padding: 16px 20px;
                background-color: #f8f9fa;
                border-top: 1px solid #e9ecef;
                text-align: center;
                font-size: 13px;
                color: #6c757d;
            `;
            footer.textContent = '処理が完了するまでしばらくお待ちください...';
            return footer;
        }

        /**
         * グローバル関数のフックを設定
         */
        _setupGlobalHooks() {
            // kintone API呼び出しの監視
            this._hookKintoneAPI();
        }

        /**
         * kintone APIのフック
         */
        _hookKintoneAPI() {
            if (typeof kintone !== 'undefined' && kintone.api) {
                const originalAPI = kintone.api;
                const self = this;
                
                kintone.api = function(...args) {
                    const processId = self.startProcess('kintone API呼び出し', 'データ取得中...');
                    
                    const result = originalAPI.apply(this, args);
                    
                    // Promiseの場合
                    if (result && typeof result.then === 'function') {
                        return result
                            .then(response => {
                                self.updateProcess(processId, '完了', '取得完了');
                                setTimeout(() => self.endProcess(processId), 500);
                                return response;
                            })
                            .catch(error => {
                                self.updateProcess(processId, 'エラー', 'API呼び出しエラー');
                                setTimeout(() => self.endProcess(processId), 1000);
                                throw error;
                            });
                    } else {
                        // 同期処理の場合
                        self.endProcess(processId);
                        return result;
                    }
                };
            }
        }

        /**
         * 処理を開始
         */
        startProcess(type, description = '') {
            const processId = ++this.processCounter;
            const startTime = Date.now();
            
            const processInfo = {
                id: processId,
                type: type,
                description: description,
                status: '実行中',
                startTime: startTime,
                element: this._createProcessElement(processId, type, description)
            };
            
            this.activeProcesses.set(processId, processInfo);
            
            // UI要素を追加
            this.ui.processesContainer.appendChild(processInfo.element);
            
            // 監視開始
            if (!this.isMonitoring) {
                this.show();
                this._startMonitoring();
            }
            
            return processId;
        }

        /**
         * 処理を更新
         */
        updateProcess(processId, status, description = '') {
            const processInfo = this.activeProcesses.get(processId);
            if (!processInfo) return;
            
            processInfo.status = status;
            if (description) processInfo.description = description;
            
            this._updateProcessElement(processInfo);
        }

        /**
         * 処理を終了
         */
        endProcess(processId) {
            const processInfo = this.activeProcesses.get(processId);
            if (!processInfo) return;
            
            // UI要素を削除
            if (processInfo.element && processInfo.element.parentNode) {
                processInfo.element.remove();
            }
            
            this.activeProcesses.delete(processId);
            
            // すべての処理が完了した場合は監視終了
            if (this.activeProcesses.size === 0) {
                this._stopMonitoring();
                this.hide();
            }
        }

        /**
         * プロセス要素を作成
         */
        _createProcessElement(processId, type, description) {
            const element = document.createElement('div');
            element.setAttribute('data-process-id', processId);
            element.style.cssText = `
                padding: 16px 20px;
                border-bottom: 1px solid #e9ecef;
                transition: all 0.3s ease;
            `;
            
            element.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="
                        width: 20px;
                        height: 20px;
                        border: 3px solid #e9ecef;
                        border-top: 3px solid #667eea;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 4px;">
                            ${type}
                        </div>
                        <div style="font-size: 13px; color: #666;" class="process-description">
                            ${description}
                        </div>
                        <div style="font-size: 12px; color: #999; margin-top: 4px;" class="process-time">
                            実行時間: <span class="elapsed-time">0</span>秒
                        </div>
                    </div>
                    <div style="
                        padding: 4px 8px;
                        background-color: #667eea;
                        color: white;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                    " class="process-status">
                        実行中
                    </div>
                </div>
            `;
            
            return element;
        }

        /**
         * プロセス要素を更新
         */
        _updateProcessElement(processInfo) {
            const element = processInfo.element;
            if (!element) return;
            
            const descriptionEl = element.querySelector('.process-description');
            const statusEl = element.querySelector('.process-status');
            
            if (descriptionEl) descriptionEl.textContent = processInfo.description;
            if (statusEl) {
                statusEl.textContent = processInfo.status;
                
                // ステータスに応じて色を変更
                if (processInfo.status === '完了') {
                    statusEl.style.backgroundColor = '#28a745';
                } else if (processInfo.status === 'エラー') {
                    statusEl.style.backgroundColor = '#dc3545';
                }
            }
        }

        /**
         * 監視を開始
         */
        _startMonitoring() {
            this.isMonitoring = true;
            
            // 経過時間の更新
            this.updateInterval = setInterval(() => {
                this.activeProcesses.forEach(processInfo => {
                    const elapsedTime = Math.floor((Date.now() - processInfo.startTime) / 1000);
                    const timeEl = processInfo.element?.querySelector('.elapsed-time');
                    if (timeEl) {
                        timeEl.textContent = elapsedTime;
                    }
                });
            }, 1000);
        }

        /**
         * 監視を停止
         */
        _stopMonitoring() {
            this.isMonitoring = false;
            
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
        }

        /**
         * UI表示
         */
        show() {
            this.ui.overlay.style.display = 'block';
            // フェードイン効果
            setTimeout(() => {
                this.ui.overlay.style.opacity = '1';
            }, 10);
        }

        /**
         * UI非表示
         */
        hide() {
            this.ui.overlay.style.opacity = '0';
            setTimeout(() => {
                this.ui.overlay.style.display = 'none';
                // プロセス一覧をクリア
                this.ui.processesContainer.innerHTML = '';
            }, 300);
        }

        /**
         * 手動で処理を追加（外部から呼び出し可能）
         */
        static startProcess(type, description) {
            if (window.backgroundProcessMonitor) {
                return window.backgroundProcessMonitor.startProcess(type, description);
            }
            return null;
        }

        /**
         * 手動で処理を更新（外部から呼び出し可能）
         */
        static updateProcess(processId, status, description) {
            if (window.backgroundProcessMonitor) {
                window.backgroundProcessMonitor.updateProcess(processId, status, description);
            }
        }

        /**
         * 手動で処理を終了（外部から呼び出し可能）
         */
        static endProcess(processId) {
            if (window.backgroundProcessMonitor) {
                window.backgroundProcessMonitor.endProcess(processId);
            }
        }
    }

    // グローバルに公開
    window.BackgroundProcessMonitor = BackgroundProcessMonitor;

    // 自動初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.backgroundProcessMonitor = new BackgroundProcessMonitor();
        });
    } else {
        window.backgroundProcessMonitor = new BackgroundProcessMonitor();
    }

})(); 