/**
 * @file CreditHoursDefinitionForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-22
**/

#ifndef _CREDITHOURSDEFINITIONFORPRRULEPARAM_H_
#define _CREDITHOURSDEFINITIONFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/TrainingCreditFlagMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"
#include "matcher/TrainingAssignmentRoleMatchExpression.h"
#include "matcher/IPOrCKQualMatchExpression.h"
#include "matcher/TrainingChiefPilotRankMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"

#include <string>
#include <limits>

class CalculateCreditHoursInMandayForPRRule;


class CreditHoursDefinitionForPRRuleParam : public RuleParam {
friend class CalculateCreditHoursInMandayForPRRule;
private:
    explicit CreditHoursDefinitionForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7328;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		ASSIGNMENTS = 5,
		IS_POSITION = 6,
		TRAINING_ROLES = 7,
		PERCENTAGE = 8,
		SEVERITY = 9
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//Ground Roster/Segment的任务类型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _assignments{};
	AssignmentMatchExpression<Activity> _assignmentMatch;

	//当配置Assignments=DHD时，进一步区分属于Operating DHD，还是Position
	shared_ptr<bool> _isPosition{ nullptr };

	//航班的训练角色
	std::string _trainRoles{};
	TrainingRoleMatchExpression<Activity> _trainingRoleMatch;

	//计薪时间计算折算百分比
	double _creditPercentage{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	//匹配参数
	bool MatchParam(const Duty* duty, const Segment* segment) const;

	//匹配参数
	bool MatchParam(const ROSTER* roster, const Duty* duty = nullptr, const Segment* segment = nullptr, const size_t currSegIndex = 0) const;

private:
	bool MatchIsPosition(const Duty* duty, const Segment* segment, const size_t currSegIndex) const;
};

#endif //_CREDITHOURSDEFINITIONFORPRRULEPARAM_H_
