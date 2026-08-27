/**
 * @file SegmentRestrictionDayNightForEvaFdRuleParam.h
 * @brief Duty航段数的特殊限制参数 - 早晚班限制相关参数
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _SEGMENTRESTRICTIONDAYNIGHTFOREVAFDRULEPARAM_H_
#define _SEGMENTRESTRICTIONDAYNIGHTFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckSegmentRestrictionWOCLForEvaFdRule;

class SegmentRestrictionDayNightForEvaFdRuleParam : public RuleParam {
friend class CheckSegmentRestrictionWOCLForEvaFdRule;
friend class SegmentRestrictionWOCLForEvaFdRuleParam;
private:
    explicit SegmentRestrictionDayNightForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7204;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

    enum class ParamLocation {
		COMPOSITIONS = 0,
		DUTY_ASSIGNMENTS = 1,
		DEPARTURE_START = 2,
		DEPARTURE_END = 3,
		MIN_DUTY_BLH = 4,
		MIN_DUTY_FDP = 5,
		MAX_SECTOR = 6,
		SEVERITY = 7
    };

	//机组人员配比方案,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _compositions{};

	//Duty任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	vector<string> _dutyAssignments{};

	//Duty首段航班的起飞开始时间(本地时间),格式：HH:mm
	std::string _departureStartTimeHHmm{};
	int _departureStartTimeMinutes{};

	//Duty首段航班的起飞结束时间(本地时间),格式：HH:mm
	std::string _departureEndTimeHHmm{};
	int _departureEndTimeMinutes{};

	//满足最小Duty的飞时（分钟数）,支持*通配。格式：HH:mm
	std::string _minDutyFt{};
	int _minDutyFtMinutes{};

	//满足最小Duty的FDP（分钟数）,支持*通配。格式：HH:mm
	std::string _minDutyFDP{};
	int _minDutyFDPMinutes{};

	//Duty最大航段数
	int _maxSegmentNum{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断Duty的机组人员配比方案是否满足
	bool MatchComposition(const Duty& duty) const;

	//判断Duty是否满足任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	//判断Duty首段航班的起飞开始时间是否满足
	bool MatchFirstSegmentDeparture(const Duty& duty) const;

	//判断Duty的飞时是否满足
	bool MatchDutyFlightTime(const Duty& duty) const;

	//判断Duty的FDP是否满足
	bool MatchDutyFDP(const Duty& duty) const;

public:

	bool MatchRule(const Duty& duty) const;

	bool CheckRule(const Duty& duty) const;

};

#endif //_SEGMENTRESTRICTIONDAYNIGHTFOREVAFDRULEPARAM_H_
