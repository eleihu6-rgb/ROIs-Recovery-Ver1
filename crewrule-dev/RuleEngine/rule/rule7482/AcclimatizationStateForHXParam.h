/**
 * @file AcclimatizationStateForHXParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-12S
**/

#ifndef _ACCLIMATIZATIONSTATEFORHXPARAM_H_
#define _ACCLIMATIZATIONSTATEFORHXPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class AcclimatizationForHXRule;
class LimitTaskOnRecoveryPeriodForHXRule;

class AcclimatizationStateForHXParam : public RuleParam {
	friend class AcclimatizationForHXRuleParam;
	friend class AcclimatizationForHXRule;
	class LimitTaskOnRecoveryPeriodForHXRule;
public:

	//适用状态,取值：A-适应状态，U-未知状态
	std::string GetAcclimatizationState() const {
		return _acclimatizationState;
	}

	//判断是否匹配时区差
	bool MatchTimezoneDiff(const int tzDiffMinutes) const;

	//Pairing从出发到返回基地时长范围（分钟数）
	bool MatchReturnToBaseDurationRange(const int pairingDurationMinutes) const;

private:
    explicit AcclimatizationStateForHXParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7482;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		TZ_DIFF = 1,
		RETURN_TO_BASE_DURATION_RANGE = 2,
		ACC_STATE = 3,
		SEVERITY = 4
    };

	//时差范围（分钟数）,格式：HH:mm-HH:mm.
	//例如：00:00 - 02 : 00，表示时差0小时到2小时
	std::string _timezoneDiff{};
	int _timezoneDiffMinutesLower{0};
	int _timezoneDiffMinutesUpper{0};

	//从出发到返回基地时长范围（分钟数）,格式：HH:mm-HH:mm
	//例如：00:00 - 999 : 00，表示0小时到999小时
	std::string _returnDurationRange{};
	int _returnDurationRangeMinutesLower{0};
	int _returnDurationRangeMinutesUpper{0};

	//适用状态,取值：A-适应状态，U-未知状态
	mutable std::string _acclimatizationState{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

};

#endif //_ACCLIMATIZATIONSTATEFORHXPARAM_H_
