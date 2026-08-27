/**
 * @file SegmentRestrictionFDPNightForEvaFdRuleParamRuleParam.h
 * @brief Duty航段数的特殊限制参数 - FDP夜班限制相关参数
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _SEGMENTRESTRICTIONFDPNIGHTFOREVAFDRULEPARAM_H_
#define _SEGMENTRESTRICTIONFDPNIGHTFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckSegmentRestrictionWOCLForEvaFdRule;

class SegmentRestrictionFDPNightForEvaFdRuleParam : public RuleParam {
friend class CheckSegmentRestrictionWOCLForEvaFdRule;
friend class SegmentRestrictionWOCLForEvaFdRuleParam;
private:
    explicit SegmentRestrictionFDPNightForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7204;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		COMPOSITIONS = 0,
		DUTY_ASSIGNMENTS = 1,
		FDP_LOCAL_START = 2,
		FDP_LOCAL_END = 3,
		MAX_SECTOR = 4,
		SEVERITY = 5
    };

	//机组人员配比方案,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _compositions{};

	//Duty任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _dutyAssignments{};

	//FDP本地开始时间（首段航班起飞机场时区本地时间）,格式：HH:mm
	std::string _fdpLocalStartTimeHHmm{};
	int _fdpLocalStartTimeMinutes{};

	//FDP本地结束时间（首段航班起飞机场时区本地时间）,格式：HH:mm
	std::string _fdpLocalEndTimeHHmm{};
	int _fdpLocalEndTimeMinutes{};

	//Duty最大航段数
	int _maxSegmentNum{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断Duty的机组人员配比方案是否满足
	bool MatchComposition(const Duty& duty) const;

	//判断Duty是否满足任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	//判断FDP的时间是否在范围内（Duty首段航班的本地时区）
	bool MatchFDPRanges(const Duty& duty) const;

public:

	bool MatchRule(const Duty& duty) const;

	bool CheckRule(const Duty& duty) const;

};

#endif //_SEGMENTRESTRICTIONFDPNIGHTFOREVAFDRULEPARAM_H_
