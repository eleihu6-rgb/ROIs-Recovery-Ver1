/**
 * @file CalculateMinRestAtLayoverForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/

#ifndef _CALCULATEMINRESTATLAYOVERFORTGRULEPARAM_H_
#define _CALCULATEMINRESTATLAYOVERFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMinRestAtLayoverForTGRule;

class CalculateMinRestAtLayoverForTGRuleParam : public RuleParam {
friend class CalculateMinRestAtLayoverForTGRule;
private:
    explicit CalculateMinRestAtLayoverForTGRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7023;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 5;

    enum class ParamLocation {
		IS_HOME_BASE = 1,
		DUTY_ASSIGNMENTS = 2,
		TZ_DIFF = 3,
		MIN_REST = 4,
		SEVERITY = 5
    };

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };

	//Duty的任务类型,多个值使用“|”分隔并支持*通配。
	vector<std::string> _dutyAssignments{};

	//时差范围（分钟数范围）,格式：HH:mm-HH:mm，取值范围：[HH:mm,HH:mm)
	//例如：00:00 - 02 : 00，表示时差0小时到2小时
	std::string _timezoneDiff{};
	int _timezoneDiffMinutesLower{ 0 };
	int _timezoneDiffMinutesUpper{ 0 };

	//最小休息时长（分钟数）,格式：HH:mm
	int _minRestMinutes{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配是否满足在基地条件
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//匹配Duty的任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	bool MatchDutyTzDiff(const Duty& duty) const;
	
public:
	bool MatchParam(const Duty& duty, const string& base) const;

};

#endif //_CALCULATEMINRESTATLAYOVERFORTGRULEPARAM_H_
