/**
 * @file Rule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-06
**/

#ifndef NEWRULEENGINE_RULE_H
#define NEWRULEENGINE_RULE_H

#include <memory>
using namespace std;

#include "RuleSystemDefine.h"
#include "RuleEngineDef.h"
#include "./utils/RuleViolation.h"

class RuleSystem;
class CrewDataContext;

class Rule {

public:

	explicit Rule(const RuleSystem* system, unsigned int ruleFuncId, RuleInterface::InterfaceUnderlyingType availableInterface) :
		_ruleSystem(system), _ruleFuncId(ruleFuncId), _availableInterface(availableInterface) {}
	virtual ~Rule() = default;


	inline void setDataContext(const std::shared_ptr<CrewDataContext>& dbData) {
		_dbData = dbData;
		_ruleViolation.SetDataContext(dbData);
	}

	inline const std::shared_ptr<CrewDataContext>& GetDataContext() const {
		return _dbData;
	}

	inline void setApplication(int application) {
		_application = application;
		_ruleViolation.SetApplication(_application);
	}

	inline void setRuleLegality(RULE_LEGALITY* ruleLegality) {
		_ruleViolation.SetRuleLegality(ruleLegality);
	}

	inline void setRuleViolation(const vector<RULE_VIOLATION*>* rule_violations) {
		_ruleViolation.SetRuleViolation(rule_violations);
	}

	inline RuleViolation& getRuleViolation() const {
		return _ruleViolation;
	}

	inline void setViolations(const vector<string>* violations) {
		_ruleViolation.SetViolations(violations);
	}

	inline void setDebugModel(const bool debug) {
		_ruleViolation.SetDebugModel(debug);
	}

	// Getter for common info
	inline unsigned int GetRuleFuncId() const { return _ruleFuncId; }
	inline unsigned long long GetAvailableInterface() const { return _availableInterface; }

	//是否检查所有规则，true：违规继续检查，false：违规不在检查
	inline bool IsCheckAllRule() const {
		return _application == ROSTER_EDITOR || _application == PAIRING_EDITOR;
	}

	//是否编辑器模式，true：编辑器模式，false：非编辑器模式
	inline bool IsEditorModel() const {
		return _application == ROSTER_EDITOR || _application == PAIRING_EDITOR;
	}

	//是否批处理(RuleTool)模式，true：批处理模式，false：非批处理模式
	inline bool IsBatchModel() const {
		return _application == BATCH_LEGALITY;
	}

	//是否PO优化模式
	inline bool IsPairingOptimizerModel() const {
		return _application == PAIRING_OPTIMIZER;
	}

	//是否RO优化模式
	inline bool IsRosterOptimizerModel() const {
		return _application == ROSTER_OPTIMIZER;
	}
protected:
	const unsigned int _ruleFuncId;

	// The available interface use bit mask to control on and off
	const RuleInterface::InterfaceUnderlyingType _availableInterface; // 64-bit supports maximum 64 interfaces
	const RuleSystem* _ruleSystem;

	mutable std::shared_ptr<CrewDataContext> _dbData;

	mutable RuleViolation _ruleViolation;

	mutable int	_application = -1;


};

#endif //NEWRULEENGINE_RULE_H
