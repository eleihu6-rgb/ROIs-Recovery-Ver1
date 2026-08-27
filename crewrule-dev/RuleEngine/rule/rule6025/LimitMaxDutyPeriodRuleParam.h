/**
 * @file LimitMaxDutyPeriodRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEMAXDUTYPERIODRULEPARAM_H_
#define _CALCULATEMAXDUTYPERIODRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CalculateMaxDutyPeriodRule;
class CheckMaxDutyPeriodRule;

class LimitMaxDutyPeriodRuleParam : public RuleParam {
	friend class CalculateMaxDutyPeriodRule;
	friend class CheckMaxDutyPeriodRule;
private:
    explicit LimitMaxDutyPeriodRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6025;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		IS_HOME_BASE = 0,
		ASSIGNMENTS = 1,
		ASSIGNMENT_GROUPS = 2,
		MAX_DP = 3,
		MIN_DURATION = 4,
		MAX_DURATION = 5,
		SEVERITY = 6
    };

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };
	
	//Duty的任务类型,多个值使用“|”分隔并支持*通配
	std::vector<string> _assignments{};

	//Duty的任务类型组,多个值使用“|”分隔并支持*通配
	std::vector<string> _assignmentGroups{};

	//最大执勤期,格式：HH:mm
	std::string _maxDP{};
	int _maxDPMinutes{-1};

	//最大时长,格式：HH:mm。针对地面任务则检查地面任务时长，若是Duty则检查从签到开始和签到结束时长
	std::string _maxDuration{};
	int _maxDurationMinutes{ -1 };

	//最小时长,格式：HH:mm。针对地面任务则检查地面任务时长，若是Duty则检查从签到开始和签到结束时长
	std::string _minDuration{};
	int _minDurationMinutes{ -1 };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断Duty是否满足任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	//判断Duty是否满足任务类型组
	bool MatchDutyAssignmentGroups(const Duty& duty) const;

	//判断Duty是否在基地
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//判断地面任务是否在基地
	bool MatchHomeBase(const ROSTER& roster, const std::string& base) const;

	//判断地面任务是否满足任务类型
	bool MatchGroundAssignments(const ROSTER& roster) const;

	//判断地面任务是否满足任务类型组
	bool MatchGroundAssignmentGroups(const ROSTER& roster) const;

public:

	//匹配Duty是否满足参数
	bool MatchParam(const Duty& duty, const string& base) const;

	//匹配地面任务是否满足参数
	bool MatchParam(const ROSTER& roster, const string& base) const;

};

#endif //_CALCULATEMAXDUTYPERIODRULEPARAM_H_
