/**
 * @file CreditHoursForCARSRuleParam.h
 * @brief 
 * @author auto-generated
 * @version 1.0
 * @date 2026-04-10
**/

#ifndef _CREDITHOURSFORCARSRULEPARAM_H_
#define _CREDITHOURSFORCARSRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "../constant/Constants.h"

#include <string>
#include <limits>

class CalculateCreditHoursForCARSRule;


class CreditHoursForCARSRuleParam : public RuleParam {
friend class CalculateCreditHoursForCARSRule;
private:
    explicit CreditHoursForCARSRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7502;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 10;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		ASSIGNMENT_GROUPS = 5,
		ASSIGNMENTS = 6,
		MINIMUM_CH = 7,
		FT_RATIO = 8,
		DP_RATIO = 9,
		SPLIT_METHOD = 10
    };

	//所属基地,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _teams{};

	//Segment或地面任务的Assignment Group列表,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupMatch;

	//Segment或地面任务的Assignment列表,多个值使用"|"分隔并支持*通配
	std::vector<std::string> _assignments{};
	AssignmentMatchExpression<Activity> _assignmentMatch;

	//固定Credit值,格式: HH:mm, 支持*表示忽略
	std::string _minimumCH{};
	int _minimumCHMinutes{ -1 }; //-1表示忽略

	//飞时比例,浮点类型,支持*表示忽略. Credit = 'Flight Time'*'FT Ratio'
	double _ftRatio{ -1.0 }; //-1表示忽略

	//DP比例,浮点类型,支持*表示忽略. Credit = 'Duty Period'*'DP Ratio'
	double _dpRatio{ -1.0 }; //-1表示忽略

	//跨天分隔时长方式。取值：SPAN-按时间跨度切分；START-划分到开始日。默认*表示不配置则为：SPAN
	std::string _splitMethod{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	//匹配参数
	bool MatchParam(const Duty* duty, const Segment* segment) const;

	//匹配参数
	bool MatchParam(const ROSTER* roster, const Duty* duty = nullptr, const Segment* segment = nullptr, const size_t currSegIndex = 0) const;

	//获取最小Credit值(分钟)
	int GetMinimumCHMinutes() const { return _minimumCHMinutes; }

	//获取FT Ratio
	double GetFTRatio() const { return _ftRatio; }

	//获取DP Ratio
	double GetDPRatio() const { return _dpRatio; }

	//检查是否需要计算Minimum CH
	bool NeedMinimumCH() const { return _minimumCHMinutes >= 0; }

	//检查是否需要计算FT Ratio
	bool NeedFTRatio() const { return _ftRatio >= 0; }

	//检查是否需要计算DP Ratio
	bool NeedDPRatio() const { return _dpRatio >= 0; }

private:
	int ParseTimeToMinutes(const std::string& timeStr) const;
};

#endif //_CREDITHOURSFORCARSRULEPARAM_H_
