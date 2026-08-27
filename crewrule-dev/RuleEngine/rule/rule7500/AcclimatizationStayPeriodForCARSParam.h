/**
 * @file AcclimatizationStayPeriodForCARSParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-16
**/

#ifndef _ACCLIMATIZATIONSTAYPERIODFORCARSPARAM_H_
#define _ACCLIMATIZATIONSTAYPERIODFORCARSPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class AcclimatizationForCARSRule;

class AcclimatizationStayPeriodForCARSParam : public RuleParam {
	friend class AcclimatizationForCARSRule;
	friend class AcclimatizationForCARSRuleParam;

private:
    explicit AcclimatizationStayPeriodForCARSParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7500;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 3;

    enum class ParamLocation {
		TZ_DIFF = 1,
		STAY_DURATION,
		SEVERITY
    };

	//时区差范围(分支数)，格式：HH:mm-HH:mm，取值范围：[HH:mm,HH:mm)
	//例如：00:00-04:00，表示时差0小时到4小时
	std::string _timezoneDiff{};
	int _timezoneDiffMinutesLower{0};
	int _timezoneDiffMinutesUpper{0};

	//新地点所在的时区停留时间范围(分支数)，格式：HH:mm-HH:mm，取值范围：[HH:mm,HH:mm)
	//例如：00:00-72:00，表示0小时到72小时
	std::string _stayDuration{};
	int _stayDurationMinutesLower{0};
	int _stayDurationMinutesUpper{0};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

};

#endif //_ACCLIMATIZATIONSTAYPERIODFORCARSPARAM_H_
