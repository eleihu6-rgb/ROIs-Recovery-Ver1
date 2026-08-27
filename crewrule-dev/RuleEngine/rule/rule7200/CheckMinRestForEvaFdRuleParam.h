/**
 * @file CheckMinRestForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMINRESTFOREVAFDRULEPARAM_H_
#define _CHECKMINRESTFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "../period/WorkPeriod.h"

class CalculateCheckInMinRestForEvaFdRule;
class CheckMinRestForEvaFdRule;

class CheckMinRestForEvaFdRuleParam : public RuleParam {
friend class CalculateCheckInMinRestForEvaFdRule;
friend class CheckMinRestForEvaFdRule;
private:
    explicit CheckMinRestForEvaFdRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7200;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

    enum class ParamLocation {
		COMPOSITIONS = 0,
		DUTY_ASSIGNMENT_GROUPS = 1,
		DUTY_FLEET_GROUP = 2,
		DUTY_TYPE = 3,
		BLH_RANGES = 4,
		FDP_RANGES = 5,
		BASED_MIN_REST = 6,
		INCREMENT_OF_FDP = 7,
		SEVERITY = 8
    };

	//配比,多个值使用“|”分隔并支持*通配。格式：HH:mm
	vector<std::string> _compositions{};
	//Duty的任务类型,多个值使用“|”分隔并支持*通配。
	vector<std::string> _dutyAssignmentGroups{};
	//Duty的飞机机型, 机型组(fleet表fleet_grp字段)
	vector<std::string> _dutyFleetGroups{};
	//Duty的国内国际类型,多个值使用“|”分隔并支持*通配。取值：D-国内航班，I-国际航班，R-区域航班
	vector<std::string> _dutyTypes{};
	//飞行时间范围（分钟数）,支持*通配。格式：最小值(HH:mm)-最大值(HH:mm)
	std::string _blhRanges{};
	int _blhRangesMinutesLower{ INT_MIN };
	int _blhRangesMinutesUpper{ INT_MAX };
	//FDP时间范围（分钟数）,支持*通配。格式：最小值(HH:mm)-最大值(HH:mm)
	std::string _fdpRanges{};
	int _fdpRangesMinutesLower{ INT_MIN };
	int _fdpRangesMinutesUpper{ INT_MAX };
	//最小休息时长（分钟数）,格式：HH:mm
	std::string _strBasedMinRest{};
	int _basedMinRestMinutes{};
	//最小休息的FDP增加值（分钟数）,格式：HH:mm。支持*表示忽略该参数，则FDP不参与min rest计算
	std::string _strIncrementOfFDP{};
	std::shared_ptr<int> _incrementOfFDPMinutes{nullptr};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchComposition(const Duty& duty) const;

	bool MatchDutyAssignmentGroup(const Duty& duty) const;

	bool MatchDutyFleetGroups(const Duty& duty) const;

	bool MatchDutyTypes(const Duty& duty) const;
	
	bool MatchBLHRanges(const Duty& duty) const;

	bool MatchFDPRanges(const Duty& duty) const;

public:
	bool MatchRule(const Duty& duty) const;

	bool CheckRule(const Duty* currDuty, const Duty* nextDuty, const int minRest) const;

	bool CheckRule(const Duty* currDuty, const WorkPeriod* nextWorkPeriod, const int minRest) const;

};

#endif //_CHECKMINRESTFOREVAFDRULEPARAM_H_
