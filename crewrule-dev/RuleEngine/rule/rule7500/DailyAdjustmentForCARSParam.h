/**
 * @file DailyAdjustmentForCARSParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-16
**/

#ifndef _DAILYADJUSTMENTFORCARSPARAM_H_
#define _DAILYADJUSTMENTFORCARSPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class AcclimatizationForCARSRule;

class DailyAdjustmentForCARSParam : public RuleParam {
	friend class AcclimatizationForCARSRule;
	friend class AcclimatizationForCARSRuleParam;

private:
    explicit DailyAdjustmentForCARSParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7500;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 3;

    enum class ParamLocation {
		STAY_DURATION_PER_HOURS = 1,
		ACC_TIME_ZONE_ADJUST_HOURS,
		SEVERITY
    };

	//每在一个新时区停留X小时，格式：HH:mm，例如：24:00
	int _stayDurationPerHoursMinutes{ 0 };

	//每在一个新时区停留X小时，格式：HH:mm，例如：24:00
	int _accTimeZoneAdjustHoursMinutes{ 0 };

    void ParseParam(const std::string& paramString);

public:
	void ParseParam(const DBRule& dbRule);

	// This is function is for rule 7501 to generate one objecct becasue the constructer is private
	static DailyAdjustmentForCARSParam GetInstance(const Rule* rule) {
		return DailyAdjustmentForCARSParam(rule);
	}
	
};

#endif //_DAILYADJUSTMENTFORCARSPARAM_H_
