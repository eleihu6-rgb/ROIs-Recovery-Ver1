/**
 * @file MinODPInPeriodForCcRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MINODPINPERIODFORCCRULEPARAM_H_
#define _MINODPINPERIODFORCCRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class MinODPInPeriodForCcRule;

class MinODPInPeriodForCcRuleParam : public RuleParam {
friend class MinODPInPeriodForCcRule;
private:
    explicit MinODPInPeriodForCcRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6110;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		MAX_PERIOD_DAYS = 0,
		MIN_CONSECUTIVE_HOURS_PER_PERIOD = 1,
		MAX_PERIOD_NIGHTS = 2,
		MIN_CONSECUTIVE_NIGHTS_PER_PERIOD = 3,
		NIGHT_START_TIME = 4,
		NIGHT_END_TIME = 5,
		MAX_ROSTER_PERIOD = 6,
		MIN_DAYS_FREE_OF_DUTY = 7,
		SEVERITY = 8
    };

	//最大连续天,例如：7
	unsigned int _maxPeriodDays{};
	//最大连续小时数(每周期),例如：36
	unsigned int _minConsecutiveHoursPerPeriod{};
	//最大连续夜晚（天）,例如：8，表示连续8天夜晚
	unsigned int _maxPeriodNights{};
	//最小连续本地夜晚（天）(每周期),本地夜晚天数，例如：2 
	unsigned int _minConsecutiveNightsPerPeriod{};
	//夜晚开始时间（时分）,格式：HH:mm。例如：22:00，表示22时0分
	std::string _nightStartTime{};
	//夜晚结束时间（时分）,格式：HH:mm。例如：05:00，表示5时0分
	std::string _nightEndTime{};
	//本地夜晚最小休息时长,格式：HH:mm，通过_nightStartTime、_nightEndTime计算获得
	std::string _nightMinRestInterval{};
	//最大排班周期（天）,例如：28
	unsigned int _maxRosterPeriod{};
	//最小休息日（天）,例如：6
	unsigned int _minDaysFreeOfDuty{};



    void ParseParam(const std::string& paramString);
    //bool MatchParam(const std::string& composition, const long& reportTime, bool isAugment) const;

	void ParseParam(const DBRule& dbRule);
};

#endif //_MINODPINPERIODFORCCRULEPARAM_H_
