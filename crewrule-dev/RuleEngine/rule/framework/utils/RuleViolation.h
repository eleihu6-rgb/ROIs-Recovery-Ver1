#ifndef _RULEVIOLATION_H_
#define _RULEVIOLATION_H_

#include <algorithm>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "Utility.h"
#include "RuleStatistics.h"
#include "RuleEngineDef.h"
#include "RuleLegality.h"
#include "RuleViolation.h"

class RuleParam;

class RuleViolation {

public:
	void SetApplication(int application) {
		_application = application;
	}

	void SetDataContext(const std::shared_ptr<CrewDataContext>& dbData) {
		_dbData = dbData;
	}

	void SetRuleLegality(RULE_LEGALITY* ruleLegality) {
		_ruleLegality = ruleLegality;
	}

	RULE_LEGALITY* GetRuleLegality() const {
		return _ruleLegality;
	}

	void SetViolations(const vector<string>* violations) {
		_violations = const_cast<vector<string>*>(violations);
	}

	void SetRuleViolation(const vector<RULE_VIOLATION*>* rule_violations) {
		_rule_violations = const_cast<vector<RULE_VIOLATION*>*>(rule_violations);
	}

	void SetDebugModel(const bool debug) {
		_debug = debug;
	}

	//设置违规规则参数
	void SetRuleParam(const RuleParam& ruleParam) {		
		if (_application == PAIRING_OPTIMIZER || _application == ROSTER_OPTIMIZER)
			return;
		_ruleParam = &ruleParam;
	}

	void SetParam(const std::string& paramName, const std::string& paramValue) {
		if (_application == PAIRING_OPTIMIZER || _application == ROSTER_OPTIMIZER)
			return;

		_params[paramName] = paramValue;
	}

	void ClearParam() {
		if (_application == PAIRING_OPTIMIZER || _application == ROSTER_OPTIMIZER)
			return;
		_params.clear();
	}

	std::string GetParam(const std::string& paramName) {
		if (_application == PAIRING_OPTIMIZER || _application == ROSTER_OPTIMIZER)
			return "";
		std::map<string,string>::const_iterator iter = _params.find(paramName);
		if (iter != _params.end())
		{
			return iter->second;
		}
		return "";
	}

	bool ExistRuleViolation(RULE_VIOLATION* rv);

	void AddRuleViolations(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster, Pairing* pairing, Duty * duty, Segment* segment, RULE_VIOLATION* prv, string message);

	//若rv已存在则delete, 否则加入 list
	void AddRuleViolations(RULE_VIOLATION* rv);

	void SetLegalityMessage(SharedPtr<CREW>& pCrew, string strMessage);

	void SetLegalityMessage(SharedPtr<ROSTER> pRoster, bool isRuleLegality, string strMessage, long long ruleId);

	void SetLegalityMessage(Pairing * pPairing, bool isRuleLegality, string strMessage);

	void SetLegalityMessage(Pairing * pPairing, string strMessage);

	void SetLegalityMessage(Duty * pDuty, string strMessage, long long ruleId);

	void SetLegalityMessage(Segment * pSegment, string strMessage);

	void SetLegalityMessage(RULE_LEGALITY * pcrew, string strMessage);

private:

	RULE_LEGALITY* _ruleLegality = nullptr;

	vector<RULE_VIOLATION*>* _rule_violations = nullptr;

	vector<string>* _violations = nullptr;

	int	_application = -1;

	bool _debug = false;

	const RuleParam* _ruleParam = nullptr;

	std::shared_ptr<CrewDataContext> _dbData = nullptr;

	std::map<std::string, std::string> _params; //违规参数

	bool DebugMode() { return _debug; };

	void AddViolations(string msg);
};

#endif //_RULEVIOLATION_H_
