/**
 * データ統合クラス
 */
class DataIntegrator {
    constructor() {
        // 更新前参照用インデックス: appId(string) -> Map(recordId(string) -> kintoneRecord(object))
        this.recordIndexByApp = new Map();
    }
    /**
     * 統合キーを使って全台帳を検索
     */
    searchAllLedgersWithIntegrationKeys(originalAppId, originalRecords) {
        // 統合キーを抽出
        const integrationKeys = this.extractIntegrationKeys(originalRecords);
        
        if (integrationKeys.length === 0) {
            console.log(CONFIG.system.messages.noIntegrationKeys);
            return Promise.resolve([]);
        }

        // 統合キー抽出ログは削除

        // 全台帳のデータを格納するオブジェクト
        const allLedgerData = {};
        allLedgerData[originalAppId] = originalRecords;

        // 他の台帳を検索するPromiseを作成（ユーザー台帳は除外）
        const searchPromises = [];
        
        Object.keys(CONFIG.apps).forEach(appId => {
            if (appId !== originalAppId) {
                // 主キー検索のみ実行
                const promise = this.searchByPrimaryKeys(appId, integrationKeys)
                    .then(records => {
                        allLedgerData[appId] = records;
                        console.log(`🔍 ${CONFIG.apps[appId].name}の主キー検索結果: ${records.length}件`);
                        return records;
                    });
                searchPromises.push(promise);
            }
        });

        // ユーザー台帳をBSSIDで検索するPromiseを追加
        const userListPromise = this.searchUserListByUserIds(allLedgerData)
            .then(userListData => {
                // ユーザー台帳検索結果ログは削除
                return userListData;
            });
        searchPromises.push(userListPromise);

        // 全ての検索が完了したらデータを統合
        return Promise.all(searchPromises)
            .then(async (results) => {
                // 最後の結果がユーザー台帳データ
                const userListData = results.pop();
                // インデックスを構築/更新
                this.buildOrUpdateRecordIndex(allLedgerData);
                return await this.integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData);
            });
    }

    /**
     * 統合キーから主キーを抽出
     */
    parseIntegrationKey(integrationKey) {
        if (!integrationKey || typeof integrationKey !== 'string') {
            return { PC: null, EXT: null, SEAT: null };
        }

        const result = { PC: null, EXT: null, SEAT: null };
        
        // PC:値|EXT:値|SEAT:値 の形式をパース
        const parts = integrationKey.split('|');
        
        parts.forEach(part => {
            const [key, value] = part.split(':');
            if (key && value && value.trim() !== '') {
                result[key] = value;
            }
        });

        return result;
    }

    /**
     * 検索結果を更新前参照用のインデックスに反映
     * 形式: this.recordIndexByApp[appId][recordId] = kintoneRecord
     */
    buildOrUpdateRecordIndex(allLedgerData) {
        if (!allLedgerData) return;
        Object.entries(allLedgerData).forEach(([appId, records]) => {
            const appKey = String(appId);
            if (!this.recordIndexByApp.has(appKey)) {
                this.recordIndexByApp.set(appKey, new Map());
            }
            const map = this.recordIndexByApp.get(appKey);
            (records || []).forEach(record => {
                const recordIdField = record['$id'];
                const recordIdValue = recordIdField && recordIdField.value !== undefined
                    ? String(recordIdField.value)
                    : (record['$id'] ? String(record['$id']) : null);
                if (!recordIdValue) return;
                map.set(recordIdValue, record);
            });
        });
    }

    /**
     * 単一アプリの検索結果をインデックスに追記
     */
    updateRecordIndexForApp(appId, records) {
        if (!appId || !records) return;
        this.buildOrUpdateRecordIndex({ [String(appId)]: records });
    }

    /**
     * インデックスから元レコードを取得
     */
    getOriginalRecord(appId, recordId) {
        const appKey = String(appId);
        const recKey = String(recordId);
        if (!this.recordIndexByApp || !this.recordIndexByApp.has(appKey)) return null;
        return this.recordIndexByApp.get(appKey).get(recKey) || null;
    }

    /**
     * デバッグ: インデックス概要を出力
     */
    debugPrintIndex(appIdFilter = null) {
        try {
            if (!this.recordIndexByApp) {
                console.log('🧾 DataIntegrator: recordIndexByApp 未初期化');
                return;
            }
            const appIds = appIdFilter ? [String(appIdFilter)] : Array.from(this.recordIndexByApp.keys());
            console.log(`🧾 DataIntegrator: インデックス概要 apps=${appIds.length}`);
            appIds.forEach(appId => {
                const map = this.recordIndexByApp.get(String(appId));
                const ledgerName = (window.CONFIG && window.CONFIG.apps && window.CONFIG.apps[appId]) ? window.CONFIG.apps[appId].name : 'Unknown';
                if (!map) {
                    console.log(`  - appId=${appId}(${ledgerName}): <no entries>`);
                    return;
                }
                const size = map.size;
                const sampleIds = Array.from(map.keys()).slice(0, 5);
                console.log(`  - appId=${appId}(${ledgerName}): ${size}件, sampleIds=[${sampleIds.join(', ')}]`);
            });
        } catch (e) {
            console.log('🧾 DataIntegrator: インデックスダンプ中に例外', e);
        }
    }
    /**
     * 統合キーから抽出した主キーで各台帳を検索（全主キーフィールドをOR条件で検索）
     */
    async searchByPrimaryKeys(appId, integrationKeys) {
        const appConfig = CONFIG.apps[appId];
        if (!appConfig) return [];

        const ledgerName = appConfig.name;
        
        // 統合キーから全ての主キー値を抽出
        const pcValues = new Set();
        const extValues = new Set();
        const seatValues = new Set();

        integrationKeys.forEach(integrationKey => {
            const parsed = this.parseIntegrationKey(integrationKey);
            
            if (parsed.PC) {
                pcValues.add(parsed.PC);
            }
            if (parsed.EXT) {
                extValues.add(parsed.EXT);
            }
            if (parsed.SEAT) {
                seatValues.add(parsed.SEAT);
            }
        });

        // OR条件クエリを構築
        const queryParts = [];
        
        if (pcValues.size > 0) {
            const pcList = Array.from(pcValues).map(value => `"${value}"`).join(',');
            queryParts.push(`PC番号 in (${pcList})`);
        }
        
        if (extValues.size > 0) {
            const extList = Array.from(extValues).map(value => `"${value}"`).join(',');
            queryParts.push(`内線番号 in (${extList})`);
        }
        
        if (seatValues.size > 0) {
            const seatList = Array.from(seatValues).map(value => `"${value}"`).join(',');
            queryParts.push(`座席番号 in (${seatList})`);
        }

        if (queryParts.length === 0) {
            return [];
        }

        // OR条件で結合
        const query = queryParts.join(' or ');
        
        return window.searchEngine.searchRecordsWithQuery(appId, query);
    }

    /**
     * 2つの検索結果をマージ（重複除去）
     */
    mergeSearchResults(existingRecords, newRecords) {
        if (!existingRecords || existingRecords.length === 0) {
            return newRecords || [];
        }
        
        if (!newRecords || newRecords.length === 0) {
            return existingRecords;
        }

        // 既存レコードのIDセットを作成
        const existingIds = new Set();
        existingRecords.forEach(record => {
            const recordId = record['$id'] && record['$id'].value !== undefined 
                ? record['$id'].value 
                : record['$id'];
            if (recordId) {
                existingIds.add(recordId);
            }
        });

        // 新しいレコードから重複していないものを追加
        const mergedRecords = [...existingRecords];
        newRecords.forEach(record => {
            const recordId = record['$id'] && record['$id'].value !== undefined 
                ? record['$id'].value 
                : record['$id'];
            
            if (recordId && !existingIds.has(recordId)) {
                mergedRecords.push(record);
                existingIds.add(recordId);
            }
        });

        return mergedRecords;
    }

    /**
     * レコードから統合キーを抽出
     */
    extractIntegrationKeys(records) {
        const integrationKeys = new Set();
        
        records.forEach(record => {
            const keyField = record[CONFIG.integrationKey];
            if (keyField && keyField.value) {
                integrationKeys.add(keyField.value);
            }
        });

        return Array.from(integrationKeys);
    }

    /**
     * 統合キーを使って特定の台帳を検索
     */
    searchByIntegrationKeys(appId, integrationKeys) {
        // IN演算子で統合キーの配列を検索
        const keyList = integrationKeys.map(key => `"${key}"`).join(',');
        const query = `${CONFIG.integrationKey} in (${keyList})`;
        
        return window.searchEngine.searchRecordsWithQuery(appId, query);
    }

    /**
     * 全台帳からBSSIDを抽出してユーザー台帳を検索
     */
    searchUserListByUserIds(allLedgerData) {
        const userIds = new Set();
        const userIdFieldName = CONFIG.userList.primaryKey;
        // PC台帳のappIdを取得
        const pcAppId = Object.keys(CONFIG.apps).find(appId => CONFIG.apps[appId].name === 'PC台帳');
        const pcRecords = allLedgerData[pcAppId] || [];
        pcRecords.forEach(record => {
            const userIdField = record[userIdFieldName];
            if (userIdField && userIdField.value) {
                userIds.add(userIdField.value);
            }
        });
        if (userIds.size === 0) {
            return Promise.resolve([]);
        }
        const userIdList = Array.from(userIds).map(id => `"${id}"`).join(',');
        const query = `${userIdFieldName} in (${userIdList})`;
        return window.searchEngine.searchRecordsWithQuery(CONFIG.userList.appId, query);
    }

    /**
     * 全台帳のデータを統合し、ユーザー台帳から氏名漢字を取得
     * 統合キーでの一致に関係なく、全ての検索結果を表示
     */
    async integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData) {
        const integratedData = [];

        // ユーザー台帳をBSSIDでマップ化（CONFIG.jsから取得）
        const userIdFieldName = CONFIG.userList.primaryKey;
        //const userNameFieldName = CONFIG.fieldMappings.userName;
        const userListMapFields = CONFIG.userList.mapFields || [];
        const userMaps = {};
        userListMapFields.forEach(fieldName => {
            userMaps[fieldName] = new Map();
        });
        userListData.forEach(user => {
            const userId = user[userIdFieldName] && user[userIdFieldName].value;
            if (userId) {
                userListMapFields.forEach(fieldName => {
                    const value = user[fieldName] && user[fieldName].value;
                    userMaps[fieldName].set(userId, value || '');
                });
            }
        });

        // 全台帳の全レコードから統合キーを収集
        const allIntegrationKeys = new Set();
        
        // 起点台帳の統合キー
        integrationKeys.forEach(key => allIntegrationKeys.add(key));
        
        // 他台帳の統合キーも収集
        Object.values(allLedgerData).forEach(records => {
            records.forEach(record => {
                const keyField = record[CONFIG.integrationKey];
                if (keyField && keyField.value) {
                    allIntegrationKeys.add(keyField.value);
                }
            });
        });

        // 統合キーが存在しないレコード用の一意キーを生成（座席表パーツは除外）
        const recordsWithoutIntegrationKey = [];
        Object.entries(allLedgerData).forEach(([appId, records]) => {
            records.forEach(record => {
                const keyField = record[CONFIG.integrationKey];
                if (!keyField || !keyField.value) {
                    // 座席台帳の「座席表パーツ（図形/テキスト/線）」は統合対象から除外
                    try {
                        const ledgerName = (CONFIG.apps && CONFIG.apps[appId] && CONFIG.apps[appId].name) ? CONFIG.apps[appId].name : '';
                        if (ledgerName === '座席台帳') {
                            const otField = record['オブジェクト種別'];
                            const ot = (otField && otField.value !== undefined) ? String(otField.value) : String(otField || '');
                            if (['図形','テキスト','線'].includes(ot)) {
                                return; // skip seatmap parts
                            }
                        }
                    } catch (e) { /* noop */ }

                    const recordId = record['$id'] && record['$id'].value !== undefined 
                        ? record['$id'].value 
                        : record['$id'];
                    const uniqueKey = `EMPTY_${appId}_${recordId}`;
                    allIntegrationKeys.add(uniqueKey);
                    recordsWithoutIntegrationKey.push({ key: uniqueKey, appId, record });
                }
            });
        });

        console.log(`📊 統合処理対象: ${allIntegrationKeys.size}件 (統合キー有り: ${integrationKeys.length}件, 統合キー無し: ${recordsWithoutIntegrationKey.length}件)`);

        for (const integrationKey of allIntegrationKeys) {
            const integratedRecord = {};
            let recordUserId = null;
            
            for (const [appId, records] of Object.entries(allLedgerData)) {
                const appConfig = CONFIG.apps[appId];
                const ledgerName = appConfig.name;
                const displayFields = CONFIG.getDisplayFields(appId);
                
                let matchingRecord = null;
                
                if (integrationKey.startsWith('EMPTY_')) {
                    // 統合キーが存在しないレコードの場合
                    const emptyRecord = recordsWithoutIntegrationKey.find(item => 
                        item.key === integrationKey && item.appId === appId
                    );
                    if (emptyRecord) {
                        // 座席表パーツ（図形/テキスト/線）はここでも防波堤として除外
                        try {
                            const ledgerName = (window.CONFIG && window.CONFIG.apps && window.CONFIG.apps[appId]) ? window.CONFIG.apps[appId].name : '';
                            if (ledgerName === '座席台帳') {
                                const otField = emptyRecord.record['オブジェクト種別'];
                                const ot = (otField && otField.value !== undefined) ? String(otField.value) : String(otField || '');
                                if (['図形','テキスト','線'].includes(ot)) {
                                    continue; // skip adding this record entirely
                                }
                            }
                        } catch (e) { /* noop */ }
                        matchingRecord = emptyRecord.record;
                    }
                } else {
                    // 通常の統合キーでの検索
                    matchingRecord = records.find(record => {
                        const keyField = record[CONFIG.integrationKey];
                        return keyField && keyField.value === integrationKey;
                    });
                }
                
                if (matchingRecord) {
                    // レコードが存在する場合、displayFieldsで指定されたフィールドを追加
                    displayFields.forEach(fieldCode => {
                        const fieldValue = matchingRecord[fieldCode];
                        const displayValue = fieldValue && fieldValue.value !== undefined 
                            ? fieldValue.value 
                            : fieldValue;
                        
                        integratedRecord[`${ledgerName}_${fieldCode}`] = displayValue;
                        
                        // BSSIDを記録（CONFIG.jsから取得）
                        if (fieldCode === userIdFieldName && displayValue) {
                            recordUserId = displayValue;
                        }
                    });
                    
                    // レコードIDを追加（保存処理で使用するため）
                    const recordIdField = matchingRecord['$id'];
                    const recordIdValue = recordIdField && recordIdField.value !== undefined 
                        ? recordIdField.value 
                        : recordIdField;
                    integratedRecord[`${ledgerName}_$id`] = recordIdValue;
                    
                    // 統合キーも追加（マージ処理で使用するため）
                    const integrationKeyField = matchingRecord[CONFIG.integrationKey];
                    const integrationKeyValue = integrationKeyField && integrationKeyField.value !== undefined 
                        ? integrationKeyField.value 
                        : integrationKeyField;
                    integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`] = integrationKeyValue || integrationKey;
                } else {
                    // レコードが存在しない場合、displayFieldsのフィールドをnullで埋める
                    displayFields.forEach(fieldCode => {
                        integratedRecord[`${ledgerName}_${fieldCode}`] = null;
                    });
                    
                    // レコードIDもnullで追加
                    integratedRecord[`${ledgerName}_$id`] = null;
                    
                    // 統合キーもnullで追加（EMPTY_の場合は統合キー自体もnull）
                    integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`] = integrationKey.startsWith('EMPTY_') ? null : null;
                }
            }

            // ユーザー台帳から氏名漢字等を取得してPC台帳のデータとして動的に設定
            const pcLedgerName = CONFIG.integratedTableConfig.columns.find(c => c.fieldCode === 'PC番号' && c.primaryKey).ledger;
            if (recordUserId) {
                CONFIG.userList.mapFields.forEach(fieldName => {
                    if (userMaps[fieldName] && userMaps[fieldName].has(recordUserId)) {
                        integratedRecord[`${pcLedgerName}_${fieldName}`] = userMaps[fieldName].get(recordUserId);
                    } else {
                        integratedRecord[`${pcLedgerName}_${fieldName}`] = null;
                    }
                });
            }

            integratedData.push(integratedRecord);
        }

        return integratedData;
    }

    /**
     * 2つの統合データをマージ（重複を除外）
     * 統合キーが同じレコードは重複とみなし、新しいデータを優先
     */
    mergeIntegratedData(existingData, newData) {
        if (!existingData || existingData.length === 0) {
            return newData;
        }
        
        if (!newData || newData.length === 0) {
            return existingData;
        }

        // 既存データの統合キーをセットで管理（高速検索のため）
        const existingKeys = new Set();
        const mergedData = [...existingData];

        // 既存データから統合キーを抽出
        existingData.forEach(record => {
            // 統合キーを各台帳のフィールドから探す
            const integrationKey = this.extractIntegrationKeyFromRecord(record);
            if (integrationKey) {
                existingKeys.add(integrationKey);
            }
        });

        // 新しいデータから重複していないものを追加
        newData.forEach(record => {
            const integrationKey = this.extractIntegrationKeyFromRecord(record);
            
            if (integrationKey) {
                // 統合キーが存在する場合の重複チェック
                if (!existingKeys.has(integrationKey)) {
                    mergedData.push(record);
                    existingKeys.add(integrationKey);
                } else {
                    console.log(`❌ 重複レコード除外: 統合キー=${integrationKey}`);
                }
            } else {
                // 統合キーがnullの場合は、とりあえず追加
                mergedData.push(record);
            }
        });
        
        return mergedData;
    }

    /**
     * 統合レコードから統合キーを抽出
     * 各台帳のフィールドから統合キーに対応する値を探す
     */
    extractIntegrationKeyFromRecord(record) {
        // 各台帳から統合キーを探す
        for (const [appId, appConfig] of Object.entries(CONFIG.apps)) {
            const ledgerName = appConfig.name;
            const keyFieldName = `${ledgerName}_${CONFIG.integrationKey}`;
            
            if (record[keyFieldName] && record[keyFieldName] !== null) {
                return record[keyFieldName];
            }
        }
        
        return null;
    }

    /**
     * 不整合キー集合を検出（PC/内線/座席のいずれかのアンカーで複数キーが混在し、かつ複数台帳に跨る場合）
     * - 既存メソッドは変更せず、ここで独自に検出ロジックのみ実装
     * - レコードの実キーは「統合キー（存在すれば）」→「フィールド値から生成したキー」の順で決定
     * @param {Object} allLedgerData appId(string) -> kintoneRecords(array)
     * @returns {Set<string>} inconsistentKeySet 不整合と判定されたキー集合
     */
    findInconsistencyKeySet(allLedgerData) {
        const inconsistent = new Set();
        if (!allLedgerData) return inconsistent;

        const byPC = new Map();   // value -> { keys:Set<string>, ledgers:Set<string> }
        const byEXT = new Map();  // value -> { keys:Set<string>, ledgers:Set<string> }
        const bySEAT = new Map(); // value -> { keys:Set<string>, ledgers:Set<string> }

        const normalize = (v) => {
            const s = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
            if (s === null || s === undefined) return '';
            const t = String(s).trim();
            if (t === '' || t === '-' || t === 'なし') return '';
            return t;
        };

        const getEffectiveKey = (record) => {
            const ik = record && record[CONFIG.integrationKey];
            const ikv = (ik && ik.value !== undefined) ? ik.value : ik;
            if (ikv && String(ikv).trim() !== '') return String(ikv).trim();
            const pc = normalize(record && record['PC番号']);
            const ext = normalize(record && record['内線番号']);
            const seat = normalize(record && record['座席番号']);
            return `PC:${pc}|EXT:${ext}|SEAT:${seat}`;
        };

        const add = (map, key, effectiveKey, ledgerName) => {
            if (!key) return;
            if (!map.has(key)) {
                map.set(key, { keys: new Set(), ledgers: new Set() });
            }
            const entry = map.get(key);
            entry.keys.add(effectiveKey);
            if (ledgerName) entry.ledgers.add(ledgerName);
        };

        // 走査してアンカー別にキー集合を構築
        Object.entries(allLedgerData).forEach(([appId, records]) => {
            const appConfig = CONFIG.apps[appId];
            const ledgerName = appConfig ? appConfig.name : '';
            (records || []).forEach(record => {
                const pc = normalize(record['PC番号']);
                const ext = normalize(record['内線番号']);
                const seat = normalize(record['座席番号']);
                const effKey = getEffectiveKey(record);
                if (pc)  add(byPC, pc, effKey, ledgerName);
                if (ext) add(byEXT, ext, effKey, ledgerName);
                if (seat) add(bySEAT, seat, effKey, ledgerName);
            });
        });

        const collect = (map) => {
            map.forEach(({ keys, ledgers }) => {
                if (keys.size > 1 && ledgers.size >= 2) {
                    keys.forEach(k => inconsistent.add(k));
                }
            });
        };

        collect(byPC);
        collect(byEXT);
        collect(bySEAT);

        return inconsistent;
    }

    /**
     * 指定キー集合に該当するレコードだけを残す（全台帳）
     * @param {Object} allLedgerData
     * @param {Set<string>} keySet
     * @returns {Object} filteredAllLedgerData
     */
    filterAllLedgerDataByKeys(allLedgerData, keySet) {
        const normalize = (v) => {
            const s = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
            if (s === null || s === undefined) return '';
            return String(s).trim();
        };
        const getEffectiveKey = (record) => {
            const ik = record && record[CONFIG.integrationKey];
            const ikv = (ik && ik.value !== undefined) ? ik.value : ik;
            if (ikv && String(ikv).trim() !== '') return String(ikv).trim();
            const pc = normalize(record && record['PC番号']);
            const ext = normalize(record && record['内線番号']);
            const seat = normalize(record && record['座席番号']);
            return `PC:${pc}|EXT:${ext}|SEAT:${seat}`;
        };

        const result = {};
        Object.entries(allLedgerData || {}).forEach(([appId, records]) => {
            result[appId] = (records || []).filter(r => keySet.has(getEffectiveKey(r)));
        });
        return result;
    }

    /**
     * 不整合対象のみを統合し、バーチャルスクロール表示用の統合行配列を返す
     * - 既存の integrateAllLedgerDataWithUserList を再利用
     * @param {Object} allLedgerData
     * @returns {Promise<Array<Object>>}
     */
    async buildInconsistencyIntegratedData(allLedgerData) {
        if (!allLedgerData) return [];
        const keySet = this.findInconsistencyKeySet(allLedgerData);
        if (!keySet || keySet.size === 0) return [];

        // 対象レコードのみ残す
        const filtered = this.filterAllLedgerDataByKeys(allLedgerData, keySet);

        // ユーザー台帳を取得
        const userListData = await this.searchUserListByUserIds(filtered);

        // integrateAllLedgerDataWithUserList は allLedgerData 内の全キーで統合する設計のため、
        // ここで allLedgerData を不整合対象のみに絞り込んでから呼び出す。
        const integrationKeys = Array.from(keySet);
        const integrated = await this.integrateAllLedgerDataWithUserList(filtered, integrationKeys, userListData);

        // 最終フィルタは不要。filtered によって対象キーに絞られているため、そのまま返す。
        // 追加: 比較用プレビューフィールドを付与（各台帳の PC番号/内線番号/座席番号）
        try {
            // ledgerName -> appId の逆引き
            const ledgerToAppId = {};
            Object.entries(CONFIG.apps).forEach(([appId, cfg]) => { ledgerToAppId[cfg.name] = String(appId); });

            const getRawRecordById = (ledgerName, recordId) => {
                const appId = ledgerToAppId[ledgerName];
                if (!appId) return null;
                const list = filtered[appId] || [];
                return list.find(r => {
                    const idField = r['$id'];
                    const idVal = (idField && idField.value !== undefined) ? String(idField.value) : String(idField);
                    return String(recordId) === String(idVal);
                }) || null;
            };

            const take = (raw, fieldCode) => {
                if (!raw) return '';
                const f = raw[fieldCode];
                return (f && f.value !== undefined) ? f.value : (f || '');
            };

            integrated.forEach(row => {
                ['PC台帳','内線台帳','座席台帳'].forEach(ledger => {
                    const idKey = `${ledger}_$id`;
                    const recId = row[idKey];
                    const raw = recId ? getRawRecordById(ledger, recId) : null;
                    const pc = take(raw, 'PC番号');
                    const ext = take(raw, '内線番号');
                    const seat = take(raw, '座席番号');
                    row[`比較_${ledger}_PC番号`] = pc || '';
                    row[`比較_${ledger}_内線番号`] = ext || '';
                    row[`比較_${ledger}_座席番号`] = seat || '';
                });
            });
        } catch (e) { /* noop */ }

        return integrated;
    }

    /**
     * 不整合統合行を「関連性が高い順」に並べ替える
     * 関連性の定義: PC番号 / 内線番号 / 座席番号のいずれかを共有する行どうしをつなぐグラフの連結成分を大きい順
     * 同一成分内では、隣接ノード数（重複除外）降順 → 簡易キー昇順
     * 行のキー抽出は、行内の各台帳の「_<統合キー>」をパースして集約（PC/EXT/SEAT のいずれか）
     * @param {Array<Object>} rows
     * @returns {Array<Object>} 並べ替え後の新配列
     */
    sortIntegratedRowsByRelatedness(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return rows || [];

        // 1) 行ごとのアンカー集合（pcSet, extSet, seatSet）を構築
        const ledgerNames = Object.values(CONFIG.apps).map(a => a.name);
        const anchors = rows.map(row => {
            const pcSet = new Set();
            const extSet = new Set();
            const seatSet = new Set();

            // 行内の各台帳の統合キーをパースして集約
            ledgerNames.forEach(ledger => {
                const keyField = `${ledger}_${CONFIG.integrationKey}`;
                const ik = row[keyField];
                if (!ik) return;
                const parsed = this.parseIntegrationKey(ik);
                if (parsed.PC) pcSet.add(String(parsed.PC));
                if (parsed.EXT) extSet.add(String(parsed.EXT));
                if (parsed.SEAT) seatSet.add(String(parsed.SEAT));
            });

            // 直接フィールド（表示フィールド）からもアンカーを補完
            const directPC = row['PC台帳_PC番号'];
            if (directPC) pcSet.add(String(directPC));
            const directEXT = row['内線台帳_内線番号'];
            if (directEXT) extSet.add(String(directEXT));
            const directSEAT = row['座席台帳_座席番号'];
            if (directSEAT) seatSet.add(String(directSEAT));

            return { pcSet, extSet, seatSet };
        });

        // 2) アンカー値 → 行インデックスの逆引き
        const mapPC = new Map();
        const mapEXT = new Map();
        const mapSEAT = new Map();
        const addIndex = (map, val, idx) => {
            const key = String(val);
            if (!key) return;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(idx);
        };
        anchors.forEach((a, idx) => {
            a.pcSet.forEach(v => addIndex(mapPC, v, idx));
            a.extSet.forEach(v => addIndex(mapEXT, v, idx));
            a.seatSet.forEach(v => addIndex(mapSEAT, v, idx));
        });

        // 3) Union-Find で連結成分（共有PC/EXT/SEATがあれば同一グループ）を構築
        const parent = Array(rows.length).fill(0).map((_, i) => i);
        const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
        const uniteList = (indices) => {
            if (!indices || indices.length <= 1) return;
            const base = find(indices[0]);
            for (let i = 1; i < indices.length; i++) {
                const r = find(indices[i]);
                if (r !== base) parent[r] = base;
            }
        };
        mapPC.forEach(list => uniteList(list));
        mapEXT.forEach(list => uniteList(list));
        mapSEAT.forEach(list => uniteList(list));

        // 4) 連結成分ごとにインデックスを束ねる（代表キーも算出）
        const simpleKey = (row) => {
            const pc = row['PC台帳_PC番号'] || '';
            const ext = row['内線台帳_内線番号'] || '';
            const seat = row['座席台帳_座席番号'] || '';
            return `${pc}\u0001${ext}\u0001${seat}`;
        };

        const groups = new Map(); // root -> indices[]
        for (let i = 0; i < rows.length; i++) {
            const r = find(i);
            if (!groups.has(r)) groups.set(r, []);
            groups.get(r).push(i);
        }

        const groupEntries = Array.from(groups.entries()).map(([root, idxList]) => {
            const rep = [...idxList].sort((a, b) => simpleKey(rows[a]).localeCompare(simpleKey(rows[b])))[0];
            const repKey = simpleKey(rows[rep]);
            return { root, indices: idxList, repKey };
        });

        // 5) グループ順は代表キーの昇順（安定）
        groupEntries.sort((g1, g2) => g1.repKey.localeCompare(g2.repKey));

        // 6) グループ内はBFSで巡回し、「同一PC→同一EXT→同一SEAT」の近接性を優先
        const bfsOrderGroup = (idxList) => {
            const visited = new Set();
            const out = [];

            // 代表ノードから開始（最小simpleKey）
            const seeds = [...idxList].sort((a, b) => simpleKey(rows[a]).localeCompare(simpleKey(rows[b])));
            for (const seed of seeds) {
                if (visited.has(seed)) continue;
                const queue = [seed];
                visited.add(seed);
                while (queue.length > 0) {
                    const cur = queue.shift();
                    out.push(cur);

                    // 隣接候補をアンカー別に収集（同一PC→同一EXT→同一SEATの順で追加）
                    const neighOrdered = [];
                    const pushOrderedUnique = (arr, items) => {
                        const seen = new Set(arr);
                        items.forEach(i => { if (!visited.has(i) && !seen.has(i)) { arr.push(i); seen.add(i); } });
                    };

                    // 同一PC
                    const pcNeighbors = [];
                    anchors[cur].pcSet.forEach(v => (mapPC.get(v) || []).forEach(j => { if (j !== cur) pcNeighbors.push(j); }));
                    // 同一EXT
                    const extNeighbors = [];
                    anchors[cur].extSet.forEach(v => (mapEXT.get(v) || []).forEach(j => { if (j !== cur) extNeighbors.push(j); }));
                    // 同一SEAT
                    const seatNeighbors = [];
                    anchors[cur].seatSet.forEach(v => (mapSEAT.get(v) || []).forEach(j => { if (j !== cur) seatNeighbors.push(j); }));

                    // それぞれ simpleKey で安定整列後に順次追加
                    pcNeighbors.sort((a, b) => simpleKey(rows[a]).localeCompare(simpleKey(rows[b])));
                    extNeighbors.sort((a, b) => simpleKey(rows[a]).localeCompare(simpleKey(rows[b])));
                    seatNeighbors.sort((a, b) => simpleKey(rows[a]).localeCompare(simpleKey(rows[b])));

                    pushOrderedUnique(neighOrdered, pcNeighbors);
                    pushOrderedUnique(neighOrdered, extNeighbors);
                    pushOrderedUnique(neighOrdered, seatNeighbors);

                    // キュー投入
                    neighOrdered.forEach(n => { visited.add(n); queue.push(n); });
                }
            }
            return out;
        };

        // 7) 各グループのBFS順で結果を構築
        const result = [];
        groupEntries.forEach(g => {
            const order = bfsOrderGroup(g.indices);
            order.forEach(i => result.push(rows[i]));
        });
        return result;
    }

    /**
     * 指定行と「同一PC/内線/座席」を共有する関連行を現在の結果配列から収集
     * @param {Array<Object>} rows 現在の表示データ（window.tableRenderer.currentSearchResults）
     * @param {Object} targetRow 基準行
     * @returns {Array<Object>} 関連行（基準行を含む）
     */
    collectRelatedRowsForRow(rows, targetRow) {
        if (!Array.isArray(rows) || !targetRow) return [targetRow].filter(Boolean);

        // アンカー抽出ヘルパー
        const extractAnchors = (row) => {
            const pcSet = new Set();
            const extSet = new Set();
            const seatSet = new Set();
            try {
                // 直接フィールド
                const pc = row['PC台帳_PC番号'];
                const ext = row['内線台帳_内線番号'];
                const seat = row['座席台帳_座席番号'];
                if (pc) pcSet.add(String(pc));
                if (ext) extSet.add(String(ext));
                if (seat) seatSet.add(String(seat));
                // 各台帳の統合キー
                Object.values(CONFIG.apps).forEach(app => {
                    const ledger = app.name;
                    const keyField = `${ledger}_${CONFIG.integrationKey}`;
                    const ik = row[keyField];
                    if (ik) {
                        const parsed = this.parseIntegrationKey(ik);
                        if (parsed.PC) pcSet.add(String(parsed.PC));
                        if (parsed.EXT) extSet.add(String(parsed.EXT));
                        if (parsed.SEAT) seatSet.add(String(parsed.SEAT));
                    }
                });
            } catch (e) { /* noop */ }
            return { pcSet, extSet, seatSet };
        };

        // 逆引きインデックスの構築
        const mapPC = new Map();
        const mapEXT = new Map();
        const mapSEAT = new Map();
        const addIndex = (map, v, i) => {
            const key = String(v);
            if (!key) return;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(i);
        };
        const anchors = rows.map(extractAnchors);
        anchors.forEach((a, i) => {
            a.pcSet.forEach(v => addIndex(mapPC, v, i));
            a.extSet.forEach(v => addIndex(mapEXT, v, i));
            a.seatSet.forEach(v => addIndex(mapSEAT, v, i));
        });

        // 基準行インデックス
        const startIndex = rows.findIndex(r => r === targetRow) >= 0
            ? rows.findIndex(r => r === targetRow)
            : rows.findIndex(r => {
                // fallback: 同一統合キーで一致
                if (!r || !targetRow) return false;
                const a = window.virtualScroll?.getRecordIdFromRow?.(r) || '';
                const b = window.virtualScroll?.getRecordIdFromRow?.(targetRow) || '';
                return a === b && a !== '';
            });
        if (startIndex < 0) return [targetRow];

        // BFSで関連行を収集（PC→EXT→SEAT 優先順）
        const visited = new Set([startIndex]);
        const queue = [startIndex];
        const order = [];
        while (queue.length > 0) {
            const cur = queue.shift();
            order.push(cur);
            const pushNeighbors = (list) => {
                (list || []).forEach(i => {
                    if (!visited.has(i)) {
                        visited.add(i);
                        queue.push(i);
                    }
                });
            };
            anchors[cur].pcSet.forEach(v => pushNeighbors(mapPC.get(String(v))));
            anchors[cur].extSet.forEach(v => pushNeighbors(mapEXT.get(String(v))));
            anchors[cur].seatSet.forEach(v => pushNeighbors(mapSEAT.get(String(v))));
        }
        return order.map(i => rows[i]);
    }
}

// グローバルに公開
window.DataIntegrator = DataIntegrator; 