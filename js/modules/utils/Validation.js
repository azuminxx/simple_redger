/**
 * バリデーションエンジン
 * - 保存時、セル編集時、セル交換/分離時に使用
 * - ルールは最小限（必須、数値）から開始。将来的に追加可能
 */
class ValidationEngine {
  constructor() {
    // レコードID（統合キー）→ 不正フィールドSet
    this.invalidFields = new Map();
  }

  // ===== 公開API =====

  /**
   * 単一フィールドを検証し、UIに反映
   */
  async validateField(recordIndex, fieldKey) {
    try {
      const row = window.tableRenderer?.currentSearchResults?.[recordIndex];
      if (!row) return true;

      const column = CONFIG.integratedTableConfig.columns.find(c => c.key === fieldKey);
      if (!column) return true;

      const value = row[fieldKey];
      const errors = await this.runFieldRules(column, value, row);

      if (errors.length > 0) {
        this.markInvalid(recordIndex, fieldKey);
        return false;
      } else {
        this.clearInvalid(recordIndex, fieldKey);
        return true;
      }
    } catch (error) {
      console.error('バリデーションエラー(validateField):', error);
      return true; // バリデーション失敗時はブロックしない
    }
  }

  /**
   * 1行すべてのカラムを検証し、UIに反映
   */
  async validateRow(recordIndex) {
    const row = window.tableRenderer?.currentSearchResults?.[recordIndex];
    if (!row) return true;

    const validations = CONFIG.integratedTableConfig.columns
      .filter(c => !c.isChangeFlag && !c.isDetailLink && !c.isConsistencyCheck)
      .map(async (column) => {
        const value = row[column.key];
        const errors = await this.runFieldRules(column, value, row);
        if (errors.length > 0) {
          this.markInvalid(recordIndex, column.key);
          return false;
        } else {
          this.clearInvalid(recordIndex, column.key);
          return true;
        }
      });

    const results = await Promise.all(validations);
    return results.every(Boolean);
  }

  /**
   * 保存前の検証。対象行インデックス配列に対して実行
   * 戻り値: true=すべてOK / false=不正あり
   */
  async validateBeforeSave(changedIndices) {
    if (!changedIndices || changedIndices.length === 0) return true;
    let allValid = true;

    for (const idx of changedIndices) {
      const ok = await this.validateRow(idx);
      if (!ok) allValid = false;
    }

    if (!allValid) {
      this.showToast('未入力または不正な値があります。ハイライトされたセルを修正してください。', 'error');
    }
    return allValid;
  }

  // ===== ルール実装（最小） =====

  /**
   * カラム定義と値に基づき、ルールを実行してエラーメッセージ配列を返す
   */
  async runFieldRules(column, value, row = null) {
    const errors = [];

    // 1) 固定必須（列定義 required:true） — 設定で無効化可能
    if (CONFIG?.validation?.enforceColumnRequired) {
      if (column.required && this.isEmpty(value)) {
        errors.push('必須');
      }
    }

    // 2) 数値ルール（フィールドタイプ=number）
    try {
      const fieldInfo = await window.virtualScroll?.getFieldInfo(column.appId, column.fieldCode);
      if (fieldInfo && fieldInfo.type === 'number' && !this.isEmpty(value)) {
        if (!this.isNumeric(value)) {
          errors.push('数値のみ');
        }
      }
    } catch (e) {
      // 型取得失敗時はスキップ
    }

    // 3) 条件付き必須（CONFIG.validation.conditionalRequired）
    try {
      if (row && Array.isArray(CONFIG?.validation?.conditionalRequired)) {
        const targetKey = column.key; // 台帳_フィールド 形式
        const rules = CONFIG.validation.conditionalRequired.filter(r => r.targetKey === targetKey);
        for (const rule of rules) {
          const allConditionsMet = (rule.when || []).every(cond => {
            const val = row[cond.fieldKey];
            switch (cond.operator) {
              case 'notEmpty':
                return !this.isEmpty(val);
              case 'empty':
                return this.isEmpty(val);
              case 'equals':
                return String(val ?? '') === String(cond.value ?? '');
              case 'notEquals':
                return String(val ?? '') !== String(cond.value ?? '');
              default:
                return false;
            }
          });
          if (allConditionsMet && this.isEmpty(value)) {
            errors.push('必須（条件付き）');
            break;
          }
        }
      }
    } catch (e) {
      // 無視
    }

    // 4) 値ルール（CONFIG.validation.valueRules）
    try {
      if (row && Array.isArray(CONFIG?.validation?.valueRules)) {
        // どのルールにも一致しない場合はスキップ。一致したルールのexpectに従って評価
        for (const rule of CONFIG.validation.valueRules) {
          const match = (rule.when || []).every(cond => this.evaluateCondition(row, cond));
          if (!match) continue;

          // 期待状態を評価
          const expect = rule.expect || {};
          if (Object.prototype.hasOwnProperty.call(expect, column.key)) {
            const expectedState = expect[column.key]; // 'empty' | 'notEmpty' | 'any'
            if (expectedState === 'empty' && !this.isEmpty(value)) {
              errors.push('空欄である必要があります');
            } else if (expectedState === 'notEmpty' && this.isEmpty(value)) {
              errors.push('値が必要です');
            } // 'any' は制約なし
          }
        }
      }
    } catch (e) {
      // 無視
    }

    // 5) 組み合わせルール（CONFIG.validation.combinationRules）
    try {
      if (row && Array.isArray(CONFIG?.validation?.combinationRules)) {
        for (const rule of CONFIG.validation.combinationRules) {
          if (!rule.requires) continue;
          // このカラムに関係する要件のみ評価
          const req = rule.requires.find(r => r.fieldKey === column.key);
          if (!req) continue;

          // 正引きのみ評価（whenが成立した場合に限り要件をチェック）
          const whenMatched = (rule.when || []).every(cond => this.evaluateCondition(row, cond));
          if (!whenMatched) continue;

          const current = value;
          const curArr = this.toArrayValue(current);

          if (Array.isArray(req.containsAll)) {
            const missing = req.containsAll.filter(x => !curArr.includes(String(x)));
            if (missing.length > 0) {
              errors.push(`次をすべて選択してください: ${req.containsAll.join(', ')}`);
            }
          }
          if (Array.isArray(req.equalsAny)) {
            const ok = req.equalsAny.some(x => curArr.includes(String(x)));
            if (!ok) {
              errors.push(`次のいずれかを選択してください: ${req.equalsAny.join(', ')}`);
            }
          }
          if (Object.prototype.hasOwnProperty.call(req, 'equals')) {
            if (String(current ?? '') !== String(req.equals ?? '')) {
              errors.push(`値は「${req.equals}」である必要があります`);
            }
          }
        }
      }
    } catch (e) {
      // 無視
    }

    return errors;
  }

  // 汎用条件評価
  evaluateCondition(row, cond) {
    const val = row[cond.fieldKey];
    const arr = this.toArrayValue(val);
    switch (cond.operator) {
      case 'notEmpty':
        return !this.isEmpty(val);
      case 'empty':
        return this.isEmpty(val);
      case 'equals':
        return String(val ?? '') === String(cond.value ?? '');
      case 'notEquals':
        return String(val ?? '') !== String(cond.value ?? '');
      case 'equalsAny':
        return Array.isArray(cond.value) && cond.value.some(x => arr.includes(String(x)));
      default:
        return false;
    }
  }

  // 値を配列に正規化
  toArrayValue(v) {
    if (Array.isArray(v)) return v.map(x => String(x));
    if (v && typeof v === 'object' && 'value' in v) return this.toArrayValue(v.value);
    if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
    if (v == null || v === undefined) return [];
    return [String(v)];
  }

  // ===== 内部: UI反映 =====

  markInvalid(recordIndex, fieldKey) {
    const recordId = window.virtualScroll?.getRecordId(recordIndex);
    if (!recordId) return;

    if (!this.invalidFields.has(recordId)) {
      this.invalidFields.set(recordId, new Set());
    }
    this.invalidFields.get(recordId).add(fieldKey);

    // セルにスタイル適用
    const cell = document.querySelector(`td[data-record-index="${recordIndex}"][data-column="${fieldKey}"]`)
      || window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
    if (cell) cell.classList.add('cell-invalid');
  }

  clearInvalid(recordIndex, fieldKey) {
    const recordId = window.virtualScroll?.getRecordId(recordIndex);
    if (!recordId) return;
    if (this.invalidFields.has(recordId)) {
      this.invalidFields.get(recordId).delete(fieldKey);
    }
    const cell = document.querySelector(`td[data-record-index="${recordIndex}"][data-column="${fieldKey}"]`)
      || window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
    if (cell) cell.classList.remove('cell-invalid');
  }

  /**
   * 再描画後のUI復元
   */
  restoreInvalidStylesUI() {
    setTimeout(() => {
      this.invalidFields.forEach((fieldSet, recordId) => {
        fieldSet.forEach(fieldKey => {
          const cell = window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
          if (cell) cell.classList.add('cell-invalid');
        });
      });
    }, 80);
  }

  // ===== ユーティリティ =====

  isEmpty(v) {
    return v === undefined || v === null || String(v).trim() === '' || v === '-';
  }

  isNumeric(v) {
    return /^-?\d+(?:\.\d+)?$/.test(String(v).trim());
  }

  showToast(message, type = 'info') {
    // TableRendererのトーストに合わせる
    if (window.tableRenderer && typeof window.tableRenderer.showToast === 'function') {
      window.tableRenderer.showToast(message, type);
    } else {
      alert(message);
    }
  }
}

// グローバル公開
window.ValidationEngine = ValidationEngine;
// シングルトンとして利用
window.validation = new ValidationEngine();

