(() => {
    'use strict';

    // =============================================================================
    // 🆕 新規レコード追加モーダル
    // =============================================================================

    class AddRecordModal {
        constructor() {
            this.currentStep = 1;
            this.selectedLedger = null;
            this.formData = {};
            this.modal = null;
            
            // ドラッグ機能用プロパティ
            this.isDragging = false;
            this.dragStartX = 0;
            this.dragStartY = 0;
            this.modalStartX = 0;
            this.modalStartY = 0;
        }

        /**
         * モーダルを表示
         */
        show() {
            this.currentStep = 1;
            this.selectedLedger = null;
            this.formData = {};
            this._createModal();
            this._renderStep1();
        }

        /**
         * モーダルを閉じる
         */
        close() {
            if (this.modal) {
                this.modal.remove();
                this.modal = null;
            }
        }

        /**
         * モーダル要素を作成
         */
        _createModal() {
            // 既存のモーダルを削除
            const existing = document.querySelector('.add-record-modal');
            if (existing) existing.remove();

            this.modal = document.createElement('div');
            this.modal.className = 'add-record-modal';
            this.modal.innerHTML = `
                <div class="add-record-overlay">
                    <div class="add-record-container">
                        <div class="add-record-header" style="cursor: move; user-select: none;">
                            <h2 class="add-record-title">🆕 新規レコード追加</h2>
                            <button type="button" class="add-record-close">&times;</button>
                        </div>
                        <div class="add-record-body">
                            <div class="add-record-progress">
                                <div class="progress-step" data-step="1">1. 台帳選択</div>
                                <div class="progress-step" data-step="2">2. 必須項目</div>
                                <div class="progress-step" data-step="3">3. 確認</div>
                            </div>
                            <div class="add-record-content"></div>
                        </div>
                        <div class="add-record-footer">
                            <button type="button" class="btn-secondary" id="prev-step">戻る</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(this.modal);
            this._attachEvents();
            this._setupDragAndDrop();
        }

        /**
         * イベントリスナーを設定
         */
        _attachEvents() {
            // 閉じるボタン
            this.modal.querySelector('.add-record-close').addEventListener('click', () => this.close());
            
            // ナビゲーションボタン
            this.modal.querySelector('#prev-step').addEventListener('click', () => this._previousStep());

        }

        /**
         * ドラッグ&ドロップ機能を設定
         */
        _setupDragAndDrop() {
            const header = this.modal.querySelector('.add-record-header');
            const container = this.modal.querySelector('.add-record-container');
            
            // 初期位置を設定（水平中央、垂直は上寄り）
            const rect = container.getBoundingClientRect();
            const centerX = (window.innerWidth - rect.width) / 2;
            const upperY = Math.max(50, (window.innerHeight - rect.height) * 0.1); // 画面上部30%の位置、最低50px
            
            container.style.position = 'fixed';
            container.style.left = centerX + 'px';
            container.style.top = upperY + 'px';
            container.style.transform = 'none'; // CSSでのセンタリングを無効化
            
            // マウスダウンイベント（ドラッグ開始）
            header.addEventListener('mousedown', (e) => {
                // 閉じるボタンをクリックした場合はドラッグしない
                if (e.target.classList.contains('add-record-close')) {
                    return;
                }
                
                this.isDragging = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                
                const containerRect = container.getBoundingClientRect();
                this.modalStartX = containerRect.left;
                this.modalStartY = containerRect.top;
                
                // ドラッグ中のスタイル
                header.style.cursor = 'grabbing';
                container.style.transition = 'none';
                
                e.preventDefault();
            });
            
            // マウスムーブイベント（ドラッグ中）
            document.addEventListener('mousemove', (e) => {
                if (!this.isDragging) return;
                
                const deltaX = e.clientX - this.dragStartX;
                const deltaY = e.clientY - this.dragStartY;
                
                const newX = this.modalStartX + deltaX;
                const newY = this.modalStartY + deltaY;
                
                // 画面外に出ないように制限
                const containerRect = container.getBoundingClientRect();
                const maxX = window.innerWidth - containerRect.width;
                const maxY = window.innerHeight - containerRect.height;
                
                const boundedX = Math.max(0, Math.min(newX, maxX));
                const boundedY = Math.max(0, Math.min(newY, maxY));
                
                container.style.left = boundedX + 'px';
                container.style.top = boundedY + 'px';
            });
            
            // マウスアップイベント（ドラッグ終了）
            document.addEventListener('mouseup', () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    header.style.cursor = 'move';
                    container.style.transition = '';
                }
            });
        }

        /**
         * ステップ1: 台帳選択
         */
        _renderStep1() {
            this.currentStep = 1;
            this._updateProgress();
            
            // 利用可能な台帳を動的に生成
            const ledgerTypes = ['SEAT', 'PC', 'EXT', 'USER'];
            const ledgerIcons = {
                'SEAT': '💺',
                'PC': '💻',
                'EXT': '📞',
                'USER': '👤'
            };
            
            const ledgerOptions = ledgerTypes.map(ledgerType => `
                <label class="ledger-option" data-ledger="${ledgerType}">
                    <input type="radio" name="ledger" value="${ledgerType}">
                    <div class="option-content">
                        <div class="option-icon">${ledgerIcons[ledgerType] || '📋'}</div>
                        <div class="option-info">
                            <div class="option-title">${this._getLedgerDisplayName(ledgerType)}</div>
                            <div class="option-desc">${this._getPrimaryKeyFieldName(ledgerType)}が必要です</div>
                        </div>
                    </div>
                </label>
            `).join('');
            
            const content = this.modal.querySelector('.add-record-content');
            content.innerHTML = `
                <div class="step-content">
                    <h3>追加する台帳を選択してください</h3>
                    <div class="ledger-options">
                        ${ledgerOptions}
                    </div>
                </div>
            `;

            // ラジオボタンの変更イベント
            content.querySelectorAll('input[name="ledger"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.selectedLedger = e.target.value;
                    // 台帳選択時に自動的に次のステップに進む
                    setTimeout(() => {
                        this._nextStep();
                    }, 300); // 少し遅延を入れてユーザーに選択を視覚的に確認させる
                });
            });
        }

        /**
         * ステップ2: 必須項目入力
         */
        _renderStep2() {
            this.currentStep = 2;
            this._updateProgress();

            const primaryKeyField = window.LedgerV2.Utils.FieldValueProcessor.getPrimaryKeyFieldByApp(this.selectedLedger);
            const ledgerFields = window.fieldsConfig.filter(f => 
                f.sourceApp === this.selectedLedger && !f.isPrimaryKey && !f.isRecordId
            );

            const content = this.modal.querySelector('.add-record-content');
            content.innerHTML = `
                <div class="step-content">
                    <h3>${this._getLedgerDisplayName(this.selectedLedger)}の必須項目を入力</h3>
                    <div class="form-group required horizontal">
                        <label for="primary-key">${primaryKeyField}：<span class="required-mark">*</span></label>
                        <div class="form-input-container">
                            <input type="text" id="primary-key" class="form-input" placeholder="${primaryKeyField}を入力" autocomplete="off">
                            <div class="field-hint">このフィールドは必須です</div>
                        </div>
                    </div>
                    ${ledgerFields.map(field => `
                        <div class="form-group horizontal">
                            <label for="${field.fieldCode}">${field.label}：</label>
                            <div class="form-input-container">
                                ${this._createFormInput(field)}
                                <div class="field-hint">オプション項目</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            // 入力イベント
            content.querySelector('#primary-key').addEventListener('input', (e) => {
                this.formData[primaryKeyField] = e.target.value;
                this._updateNavigationButtons();
            });

            ledgerFields.forEach(field => {
                const input = content.querySelector(`#${field.fieldCode}`);
                if (input) {
                    input.addEventListener('input', (e) => {
                        this.formData[field.fieldCode] = e.target.value;
                    });
                }
            });

            this._updateNavigationButtons();
        }

        /**
         * ステップ3: 確認画面
         */
        _renderStep3() {
            this.currentStep = 3;
            this._updateProgress();

            const content = this.modal.querySelector('.add-record-content');
            content.innerHTML = `
                <div class="step-content">
                    <h3>入力内容を確認してください</h3>
                    <div class="confirmation-summary">
                        <div class="summary-section">
                            <h4>📋 ${this._getLedgerDisplayName(this.selectedLedger)}</h4>
                            <div class="summary-content">
                                ${Object.entries(this.formData)
                                    .filter(([key, value]) => value && value.trim())
                                    .map(([key, value]) => `
                                        <div class="summary-item">
                                            <span class="summary-key">${key}:</span>
                                            <span class="summary-value">${value}</span>
                                        </div>
                                    `).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="confirmation-note">
                        <p>⚠️ この内容で新規レコードを追加します。よろしいですか？</p>
                    </div>
                </div>
            `;

            this._updateNavigationButtons();
        }

        /**
         * フォーム入力要素を作成
         */
        _createFormInput(field) {
            if (field.cellType === 'dropdown' && field.options) {
                const options = field.options.map(opt => 
                    `<option value="${opt.value}">${opt.label}</option>`
                ).join('');
                return `<select id="${field.fieldCode}" class="form-input" autocomplete="off">
                    <option value="">選択してください</option>
                    ${options}
                </select>`;
            } else {
                return `<input type="text" id="${field.fieldCode}" class="form-input" placeholder="${field.label}を入力" autocomplete="off">`;
            }
        }

        /**
         * 台帳表示名を取得
         */
        _getLedgerDisplayName(ledgerType) {
            // config.jsから台帳表示名を動的に取得
            if (window.fieldsConfig) {
                const field = window.fieldsConfig.find(f => f.sourceApp === ledgerType && f.isPrimaryKey);
                if (field && field.category) {
                    return field.category;
                }
            }
            
            return `${ledgerType}台帳`;
        }

        /**
         * 主キーフィールド名を取得
         */
        _getPrimaryKeyFieldName(ledgerType) {
            if (window.fieldsConfig) {
                const field = window.fieldsConfig.find(f => f.sourceApp === ledgerType && f.isPrimaryKey);
                if (field) {
                    return field.fieldCode;
                }
            }
            
            // configから取得
            const primaryKeyMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();
            return primaryKeyMapping[ledgerType] || 'ID';
        }

        /**
         * プログレス表示を更新
         */
        _updateProgress() {
            const steps = this.modal.querySelectorAll('.progress-step');
            steps.forEach((step, index) => {
                step.classList.remove('active', 'completed');
                if (index + 1 === this.currentStep) {
                    step.classList.add('active');
                } else if (index + 1 < this.currentStep) {
                    step.classList.add('completed');
                }
            });
        }

        /**
         * ナビゲーションボタンを更新
         */
        _updateNavigationButtons() {
            const prevBtn = this.modal.querySelector('#prev-step');

            // 戻るボタン
            prevBtn.style.display = this.currentStep === 1 ? 'none' : 'inline-block';

            // ステップ2以降では次へボタンを動的に作成
            if (this.currentStep >= 2) {
                this._createNextButtonForCurrentStep();
            }
        }

        /**
         * 現在のステップに応じて次へボタンを作成
         */
        _createNextButtonForCurrentStep() {
            const footer = this.modal.querySelector('.add-record-footer');
            
            // 既存の次へボタンを削除
            const existingNextBtn = footer.querySelector('#next-step');
            if (existingNextBtn) {
                existingNextBtn.remove();
            }

            // 新しい次へボタンを作成
            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'btn-primary';
            nextBtn.id = 'next-step';

                         if (this.currentStep === 2) {
                const primaryKeyField = window.LedgerV2.Utils.FieldValueProcessor.getPrimaryKeyFieldByApp(this.selectedLedger);
                const primaryKeyValue = this.formData[primaryKeyField];
                nextBtn.disabled = !primaryKeyValue || !primaryKeyValue.trim();
                nextBtn.textContent = '確認';
            } else if (this.currentStep === 3) {
                nextBtn.disabled = false;
                nextBtn.textContent = '追加実行';
            }

            // イベントリスナーを追加
            nextBtn.addEventListener('click', () => this._nextStep());

            footer.appendChild(nextBtn);
        }

        /**
         * 前のステップに戻る
         */
        _previousStep() {
            if (this.currentStep > 1) {
                this.currentStep--;
                this._renderCurrentStep();
            }
        }

        /**
         * 次のステップに進む
         */
        _nextStep() {
            if (this.currentStep < 3) {
                this.currentStep++;
                this._renderCurrentStep();
            } else {
                this._executeAdd();
            }
        }

        /**
         * 現在のステップを描画
         */
        _renderCurrentStep() {
            switch (this.currentStep) {
                case 1: this._renderStep1(); break;
                case 2: this._renderStep2(); break;
                case 3: this._renderStep3(); break;
            }
        }

        /**
         * 🔍 第1段階: 既存レコードの存在チェック
         */
        async _checkExistingRecord() {
            const primaryKeyField = window.LedgerV2.Utils.FieldValueProcessor.getPrimaryKeyFieldByApp(this.selectedLedger);
            const primaryKeyValue = this.formData[primaryKeyField];
            const appId = window.LedgerV2.Config.APP_IDS[this.selectedLedger];

            try {
                // 主キーフィールドでの検索クエリを構築
                const query = `${primaryKeyField} = "${primaryKeyValue}"`;
                const records = await window.APIManager.fetchAllRecords(appId, query, '既存レコードチェック');
                
                if (records.length > 0) {
                    return {
                        exists: true,
                        existingRecord: records[0]
                    };
                } else {
                    return {
                        exists: false,
                        existingRecord: null
                    };
                }
            } catch (error) {
                console.error('❌ 既存レコードチェックエラー:', error);
                throw new Error(`既存レコードの確認中にエラーが発生しました: ${error.message}`);
            }
        }

        /**
         * 📝 第2段階: レコード追加を実行
         */
        async _executeAdd() {
            try {
                const nextBtn = this.modal.querySelector('#next-step');
                nextBtn.disabled = true;
                nextBtn.textContent = '確認中...';

                // 第1段階: 既存レコードチェック
                const checkResult = await this._checkExistingRecord();
                
                if (checkResult.exists) {
                    // 既存レコードが見つかった場合は登録を中止
                    this._showDuplicateError(checkResult.existingRecord);
                    return;
                }

                // 第2段階: レコード追加実行
                nextBtn.textContent = '追加中...';

                // バッチIDを生成（新規レコード追加用）
                const batchId = this._generateBatchId();

                // データ準備
                const primaryKeyField = window.LedgerV2.Utils.FieldValueProcessor.getPrimaryKeyFieldByApp(this.selectedLedger);
                const appId = window.LedgerV2.Config.APP_IDS[this.selectedLedger];

                // kintone API呼び出し用データ作成（updateKeyフィールドは除外）
                const recordData = {};
                Object.entries(this.formData).forEach(([field, value]) => {
                    // updateKeyで指定するフィールドは除外
                    if (value && value.trim() && field !== primaryKeyField) {
                        recordData[field] = { value: value.trim() };
                    }
                });

                const requestBody = {
                    app: appId,
                    upsert: true,
                    records: [{
                        updateKey: {
                            field: primaryKeyField,
                            value: this.formData[primaryKeyField]
                        },
                        record: recordData
                    }]
                };

                // API呼び出し
                const response = await kintone.api('/k/v1/records', 'PUT', requestBody);

                // 生データMapに新規レコードを追加
                await this._saveNewRecordToRawDataMap(response.records[0].id, recordData);

                // 新規レコード追加の履歴を作成（バッチIDを渡す）
                await this._createAddRecordHistory(response.records[0].id, recordData, batchId);

                // 追加されたレコードをテーブルに表示
                await this._addRecordToTable(response.records[0].id);

                // 成功メッセージ
                this._showSuccessMessage();

            } catch (error) {
                console.error('❌ 新規レコード追加エラー:', error);
                this._showErrorMessage(error);
            }
        }

        /**
         * バッチIDを生成（新規レコード追加用）
         */
        _generateBatchId() {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
            const random = Math.random().toString(36).substr(2, 4).toUpperCase(); // 4桁のランダム文字列
            return `ADD_${timestamp}_${random}`;
        }

        /**
         * 新規レコードを生データMapに保存
         * @param {string} recordId - 追加されたレコードのID
         * @param {Object} recordData - レコードデータ
         */
        async _saveNewRecordToRawDataMap(recordId, recordData) {
            try {
                // DataIntegrationManagerのインスタンスを取得
                const dataIntegrationManager = window.dataIntegrationManager;
                if (!dataIntegrationManager) {
                    return;
                }

                // 主キーの値を取得
                const primaryKeyField = this._getPrimaryKeyFieldName(this.selectedLedger);
                const primaryKeyValue = this.formData[primaryKeyField];

                if (!primaryKeyValue) {
                    return;
                }

                // 新規レコードの完全なデータを作成
                const fullRecordData = {
                    $id: { value: recordId },
                    ...recordData,
                    // 主キーフィールドも追加
                    [primaryKeyField]: { 
                        value: primaryKeyValue
                    }
                };

                // 生データMapに保存（主キーの値をキーとして使用）
                dataIntegrationManager.saveRawData(this.selectedLedger, primaryKeyValue, fullRecordData);

            } catch (error) {
                console.error('❌ 新規レコード生データ保存エラー:', error);
                // エラーが発生しても新規追加処理は継続
            }
        }

        /**
         * 新規レコード追加の履歴を作成
         */
        async _createAddRecordHistory(recordId, recordData, batchId) {
            try {
                const historyAppId = window.LedgerV2.Config.APP_IDS.HISTORY;
                if (!historyAppId) {
                    console.warn('⚠️ 更新履歴台帳のアプリIDが設定されていません');
                    return;
                }

                // 追加内容を作成
                const changes = this._createAddRecordChanges(recordData);

                // レコードキーを取得
                const recordKey = this._getAddRecordKey(recordData);

                // 履歴レコードを作成（設定ファイルからフィールド名を取得）
                const historyConfig = window.LedgerV2.Config.HISTORY_FIELDS_CONFIG;
                const ledgerTypeName = this._getLedgerTypeDisplayName(this.selectedLedger);
                const historyRecord = {
                    [historyConfig.ledger_type.fieldCode]: { value: ledgerTypeName },
                    [historyConfig.record_id.fieldCode]: { value: recordId.toString() },
                    [historyConfig.record_key.fieldCode]: { value: recordKey },
                    [historyConfig.changes.fieldCode]: { value: `新規レコード追加\n${changes}` },
                    [historyConfig.requires_approval.fieldCode]: { value: '申請不要' },
                    [historyConfig.application_status.fieldCode]: { value: '申請不要' },
                    [historyConfig.batch_id.fieldCode]: { value: batchId }
                };

                // 履歴台帳に登録
                const historyBody = {
                    app: historyAppId,
                    records: [historyRecord]
                };

                await kintone.api('/k/v1/records', 'POST', historyBody);

            } catch (error) {
                console.error(`❌ 新規レコード追加履歴登録エラー (${this.selectedLedger}台帳):`, error);
                // 履歴登録エラーは新規追加の成功に影響させない
            }
        }

        /**
         * 新規レコード追加内容を作成
         */
        _createAddRecordChanges(recordData) {
            const changes = [];
            
            Object.entries(recordData).forEach(([fieldCode, fieldValue]) => {
                // フィールドの表示名を取得
                const fieldConfig = window.fieldsConfig.find(f => f.fieldCode === fieldCode);
                const fieldLabel = fieldConfig ? fieldConfig.label.replace(/[🎯💻👤🆔☎️📱🪑📍🔢🏢]/g, '').trim() : fieldCode;
                
                changes.push(`${fieldLabel}: ${fieldValue.value || '（空）'}`);
            });

            return changes.join('\n');
        }

        /**
         * 新規レコードのキーを取得
         */
        _getAddRecordKey(recordData) {
            // 各台帳の主キーフィールドを取得（configから取得）
            const primaryKeyMapping = window.LedgerV2.Utils.FieldValueProcessor.getAppToPrimaryKeyMapping();

            const primaryKeyField = primaryKeyMapping[this.selectedLedger];
            const primaryKeyData = recordData[primaryKeyField];
            return primaryKeyData ? primaryKeyData.value : '不明';
        }

        /**
         * 成功メッセージを表示
         */
        _showSuccessMessage() {
            const content = this.modal.querySelector('.add-record-content');
            content.innerHTML = `
                <div class="step-content success">
                    <div class="success-icon">✅</div>
                    <h3>新規レコードが追加されました</h3>
                    <p>${this._getLedgerDisplayName(this.selectedLedger)}に新しいレコードが正常に追加されました。</p>
                    <div class="success-actions">
                        <button type="button" class="btn-primary" id="continue-input">続けて入力</button>
                        <button type="button" class="btn-secondary" onclick="location.reload()">画面を更新</button>
                        <button type="button" class="btn-secondary" id="close-modal">閉じる</button>
                    </div>
                </div>
            `;

            // 続けて入力ボタン
            content.querySelector('#continue-input').addEventListener('click', () => this._continueInput());

            // 閉じるボタン
            content.querySelector('#close-modal').addEventListener('click', () => this.close());

            // フッターボタンを非表示
            this.modal.querySelector('.add-record-footer').style.display = 'none';
        }

        /**
         * 追加されたレコードをテーブルに表示
         */
        async _addRecordToTable(recordId) {
            try {
                
                // 追加モードを有効化
                if (window.dataManager) {
                    window.dataManager.setAppendMode(true);
                }

                // 追加されたレコードを取得
                const appId = window.LedgerV2.Config.APP_IDS[this.selectedLedger];
                const query = `$id = "${recordId}"`;
                
                const records = await window.APIManager.fetchAllRecords(appId, query, '新規追加レコード取得');
                
                if (records && records.length > 0) {
                    // 統合データ形式に変換
                    const integratedRecords = records.map(record => ({
                        ledgerData: { [this.selectedLedger]: record },
                        recordIds: { [this.selectedLedger]: record.$id.value },
                        integrationKey: record.$id.value
                    }));

                    // テーブルに表示
                    if (window.LedgerV2?.TableRender?.TableDisplayManager) {
                        const tableManager = new window.LedgerV2.TableRender.TableDisplayManager();
                        tableManager.displayIntegratedData(integratedRecords);
                    }

                } else {
                    console.warn('⚠️ 追加されたレコードが見つかりません');
                }
                
            } catch (error) {
                console.error('❌ レコードのテーブル表示エラー:', error);
            }
        }

        /**
         * 続けて入力処理
         */
        _continueInput() {
            // フォームデータをクリア（台帳選択は保持）
            this.formData = {};
            
            // フッターボタンを再表示
            this.modal.querySelector('.add-record-footer').style.display = 'flex';
            
            // ステップ2（必須項目入力）に戻る
            this.currentStep = 2;
            this._renderStep2();
        }

        /**
         * 重複エラーメッセージを表示
         */
        _showDuplicateError(existingRecord) {
            const primaryKeyField = window.LedgerV2.Utils.FieldValueProcessor.getPrimaryKeyFieldByApp(this.selectedLedger);
            const primaryKeyValue = this.formData[primaryKeyField];
            const ledgerName = this._getLedgerDisplayName(this.selectedLedger);

            // レコードIDリンクを構築
            const recordId = existingRecord.$id?.value || '';
            const recordLink = this._buildRecordLinkForDuplicate(recordId);

            // 作成日時を適切に取得・フォーマット
            const createdTime = this._formatCreatedTime(existingRecord);

            const content = this.modal.querySelector('.add-record-content');
            content.innerHTML = `
                <div class="step-content error">
                    <div class="error-icon">⚠️</div>
                    <h3>既に登録されています</h3>
                    <p><strong>「${primaryKeyValue}」</strong>は既に${ledgerName}に登録されています。</p>
                    <div class="duplicate-info">
                        <h4>📋 既存レコード情報</h4>
                        <div class="existing-record-details">
                            <div class="detail-item">
                                <span class="detail-label">レコードID:</span>
                                <span class="detail-value">${recordLink}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">${primaryKeyField}:</span>
                                <span class="detail-value">${primaryKeyValue}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">作成日時:</span>
                                <span class="detail-value">${createdTime}</span>
                            </div>
                        </div>
                    </div>
                    <div class="duplicate-actions">
                        <button type="button" class="btn-primary" id="back-to-input">入力し直す</button>
                        <button type="button" class="btn-secondary" id="continue-input">別の値で続ける</button>
                        <button type="button" class="btn-secondary" id="close-modal">閉じる</button>
                    </div>
                </div>
            `;

            // アクションボタン
            content.querySelector('#back-to-input').addEventListener('click', () => this._renderStep2());
            content.querySelector('#continue-input').addEventListener('click', () => this._continueInput());
            content.querySelector('#close-modal').addEventListener('click', () => this.close());

            // フッターボタンを非表示
            this.modal.querySelector('.add-record-footer').style.display = 'none';
        }

        /**
         * 重複エラー用のレコードリンクを構築
         */
        _buildRecordLinkForDuplicate(recordId) {
            if (!recordId) {
                return 'N/A';
            }

            try {
                const appId = window.LedgerV2.Config.APP_IDS[this.selectedLedger];
                if (!appId) {
                    return recordId; // リンクが作れない場合はIDのみ表示
                }

                // kintoneの標準レコード詳細URLを構築
                const recordUrl = `/k/${appId}/show#record=${recordId}`;
                
                return `<a href="${recordUrl}" target="_blank" style="color: #4CAF50; text-decoration: underline;">${recordId}</a>`;
            } catch (error) {
                console.error('❌ レコードリンク構築エラー:', error);
                return recordId; // エラー時はIDのみ表示
            }
        }

        /**
         * 作成日時をフォーマット
         */
        _formatCreatedTime(record) {
            try {
                // 複数の可能性のあるフィールド名で作成日時を取得
                let createdTimeValue = null;
                
                // 標準的なkintoneの作成日時フィールド
                if (record.作成日時?.value) {
                    createdTimeValue = record.作成日時.value;
                } else if (record.$created_time?.value) {
                    createdTimeValue = record.$created_time.value;
                } else if (record.created_time?.value) {
                    createdTimeValue = record.created_time.value;
                }

                if (!createdTimeValue) {
                    console.warn('⚠️ 作成日時フィールドが見つかりません:', Object.keys(record));
                    return 'N/A';
                }

                // ISO形式の日時を日本語形式に変換
                const date = new Date(createdTimeValue);
                if (isNaN(date.getTime())) {
                    console.warn('⚠️ 無効な日時形式:', createdTimeValue);
                    return createdTimeValue; // 元の値を返す
                }

                // 日本語形式でフォーマット（YYYY/MM/DD HH:mm）
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');

                return `${year}/${month}/${day} ${hours}:${minutes}`;
            } catch (error) {
                console.error('❌ 作成日時フォーマットエラー:', error);
                return 'N/A';
            }
        }

        /**
         * 台帳種別を日本語表示名に変換
         */
        _getLedgerTypeDisplayName(ledgerType) {
            const mapping = {
                'SEAT': '座席台帳',
                'PC': 'PC台帳',
                'EXT': '内線台帳',
                'USER': 'ユーザー台帳'
            };
            return mapping[ledgerType] || ledgerType;
        }

        /**
         * エラーメッセージを表示
         */
        _showErrorMessage(error) {
            const content = this.modal.querySelector('.add-record-content');
            content.innerHTML = `
                <div class="step-content error">
                    <div class="error-icon">❌</div>
                    <h3>エラーが発生しました</h3>
                    <p>新規レコードの追加中にエラーが発生しました。</p>
                    <div class="error-details">
                        <code>${error.message || error}</code>
                    </div>
                    <div class="error-actions">
                        <button type="button" class="btn-secondary" id="retry-add">もう一度試す</button>
                        <button type="button" class="btn-secondary" id="close-modal">閉じる</button>
                    </div>
                </div>
            `;

            // アクションボタン
            content.querySelector('#retry-add').addEventListener('click', () => this._renderStep3());
            content.querySelector('#close-modal').addEventListener('click', () => this.close());
        }
    }

    // =============================================================================
    // グローバルエクスポート
    // =============================================================================

    // LedgerV2名前空間にエクスポート
    if (!window.LedgerV2) window.LedgerV2 = {};
    if (!window.LedgerV2.Modal) window.LedgerV2.Modal = {};
    window.LedgerV2.Modal.AddRecordModal = AddRecordModal;

    // レガシー互換性のためグローバルに割り当て
    window.AddRecordModal = AddRecordModal;

})(); 