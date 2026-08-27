/**
 * @file StandardMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/

#ifndef _STANDARDMINRESTFORHXRULEPARAM_H_
#define _STANDARDMINRESTFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMinRestForHXRule;

class StandardMinRestForHXRuleParam : public RuleParam {
friend class CalculateMinRestForHXRule;
friend class CalculateMinRestForHXRuleParam;
private:
    explicit StandardMinRestForHXRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7488;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		DP_RANGE = 1,
		TZ_DIFF_RANGE,
		ACC_STATE,
		UNACC_AWAY_FROM_BASE_DURATION,
		COMPARE_WITH_PRE_DUTY_DP,
		STANDARD_MIN_REST,
		PHYSIOLOGICAL_REST,
		PHYSIOLOGICAL_REST_TIME_ZONE,
		SEVERITY
    };

	//Duty Period范围。格式：HH:mm-HH:mm，取值范围：[n,m]，支持*通配表示忽略
	std::string _dpRange{};
	int _dpRangeMinutesLower{};
	int _dpRangeMinutesUpper{};

	//时区差范围。格式：HH:mm-HH:mm，取值范围：[n,m]
	std::string _tzDiffRange{};
	int _tzDiffRangeMinutesLower{};
	int _tzDiffRangeMinutesUpper{};

	//适应状态。适应状态取值：A或U
	std::string _accState{};

	//第一个不适应状态Duty签到开始时间与基地（Pairing第一个Duty签到开始时间）的时长。格式：HH:mm-HH:mm，取值范围：[n,m]。支持*通配表示忽略
	std::string _unaccAwayFromBaseDuration{};
    int _unaccAwayFromBaseDurationMinutesLower{};
	int _unaccAwayFromBaseDurationMinutesUpper{};

	//Duty DP时长是否参与对比（Y/N）。
	shared_ptr<bool> _isCompareWithDutyDP{nullptr};

	//Duty的Min Rest。格式：HH:mm
	std::string _standardMinRest{};
    int _standardMinRestMinutes{ 0 };

	//是否需要生理休息（Local Night）。取值：Y/N
	shared_ptr<bool> _isPhysiologicalRest{nullptr};

	//生理休息时区。取值：Base:基地时区，Local:当地时区
	std::string _physiologicalRestTimeZone{};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchDPRange(const int dpInMinutes) const;

	bool MatchTzDiffRange(const int maxTZDiffMinutes) const;

	bool MatchUnaccAwayFromBaseDuration(const int unaccAwayFromBaseDurationOfDuty) const;

	bool MatchAccState(const Duty* duty) const;
private:

    bool MatchParam(const Duty* duty, const int maxTZDiffMinutes, const int unaccAwayFromBaseDurationOfDuty, const int dpInMinutes) const;

	bool MatchParam(const ROSTER* roster, const int maxTZDiffMinutes, const int unaccAwayFromBaseDurationOfDuty, const int dpInMinutes) const;
};

#endif //_STANDARDMINRESTFORHXRULEPARAM_H_
