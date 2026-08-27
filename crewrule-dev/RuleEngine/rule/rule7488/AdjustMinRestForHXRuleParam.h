/**
 * @file AdjustMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-27
**/

#ifndef _ADJUSTMINRESTFORHXRULEPARAM_H_
#define _ADJUSTMINRESTFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMinRestForHXRule;

class AdjustMinRestForHXRuleParam : public RuleParam {
friend class CalculateMinRestForHXRule;
friend class CalculateMinRestForHXRuleParam;
private:
    explicit AdjustMinRestForHXRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7488;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		MIN_REST_RANGE = 1,
		HOTEL_MIN_REST,
		SEVERITY
    };

	//最小休息时间范围，格式：HH:mm-HH:mm, 取值范围：[HH:mm,HH:mm], 例如：12:00-12:00
	std::string _minRestRange{};
	int _minRestRangeMinutesLower{};
	int _minRestRangeMinutesUpper{};

	//Layover在酒店休息后，调整后的最小休息时间，格式：HH:mm, 例如：10:00
	std::string _hotelMinRest{};
    int _hotelMinRestMinutes{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

private:
	bool MatchMinRestRange(const int minRest) const;
};

#endif //_ADJUSTMINRESTFORHXRULEPARAM_H_
