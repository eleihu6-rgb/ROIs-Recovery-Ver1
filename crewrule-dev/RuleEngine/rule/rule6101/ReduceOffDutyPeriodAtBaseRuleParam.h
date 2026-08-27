/**
 * @file ReduceOffDutyPeriodAtBaseRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _REDUCEOFFDUTYPERIODATBASERULEPARAM_H_
#define _REDUCEOFFDUTYPERIODATBASERULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class ReduceOffDutyPeriodAtBaseRule;

class ReduceOffDutyPeriodAtBaseRuleParam : public RuleParam {
	friend class ReduceOffDutyPeriodAtBaseRule;
private:
    explicit ReduceOffDutyPeriodAtBaseRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6101;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		BASES = 0,
		MIN_ODP_RANGES = 1,
		MIN_ODP_REDUCED_TO_MINIMUM = 2,
		SEVERITY = 3
    };

	//基地列表,多个值使用“|”分隔并支持*通配
	std::string _strBases{};
	vector<std::string> _bases{};
	//最小休息范围,格式：HH:mm-HH:mm
	std::string _minRestRanges{};
	int _minRestMinutesLower{ 0 };
	int _minRestMinutesUpper{ 0 };
	//最小休息减少到最小时长（小时）,格式：HH:mm，为空或*表示不计算
	std::string _reducedToMinRest{};
	int _reducedToMinRestMinutes{ 0 };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//判断Duty是否满足任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	//匹配最小休息范围
	bool MatchMinRestRanges(const Duty& duty) const;

public:

	//匹配是否满足参数
	bool MatchParam(const Duty& duty, const std::string& base) const;

	//判断计算参数_reducedToMinRest参数是否有效。true-有效，false-无效
	bool ValidReducedToMinRest() const;

};

#endif //_REDUCEOFFDUTYPERIODATBASERULEPARAM_H_
