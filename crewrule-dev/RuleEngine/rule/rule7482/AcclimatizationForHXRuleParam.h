/**
 * @file AcclimatizationForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-12
**/

#ifndef _ACCLIMATIZATIONFORHXRULEPARAM_H_
#define _ACCLIMATIZATIONFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "AcclimatizationStateForHXParam.h"
#include "RecoveryPeriodForHXParam.h"

class AcclimatizationForHXRule;
class LimitTaskOnRecoveryPeriodForHXRule;



class AcclimatizationForHXRuleParam : public RuleParam {
	friend class AcclimatizationForHXRule;
	friend class LimitTaskOnRecoveryPeriodForHXRule;
public:

	AcclimatizationStateForHXParam& GetAcclimatizationStateParam() const {
		return *this->_acclimatizationStateParam;
	}

	vector<RecoveryPeriodForHXParam>& GetRecoveryPeriodParams() const {
		return this->_recoveryPeriodParams;
	}

	void SetRecoveryPeriodParams(const vector<RecoveryPeriodForHXParam>& recoveryPeriodParams) {
		this->_recoveryPeriodParams = recoveryPeriodParams;
	}

private:
    explicit AcclimatizationForHXRuleParam(const Rule* rule) :RuleParam(rule) {
		_acclimatizationStateParam = std::make_unique<AcclimatizationStateForHXParam>(AcclimatizationStateForHXParam(rule));
	};

    constexpr static unsigned int RuleFuncId = 7482;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 14;

	mutable std::unique_ptr<AcclimatizationStateForHXParam> _acclimatizationStateParam;
	mutable vector<RecoveryPeriodForHXParam> _recoveryPeriodParams;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	/**
	* 判断是否匹配时区差
	*/
	bool MatchTimeZoneDiff(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

};

#endif //_ACCLIMATIZATIONFORHXRULEPARAM_H_
