/**
 * @file CheckMaxFatigueScoreFor5JRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CheckMaxFatigueScoreFor5JRulePARAM_H_
#define _CheckMaxFatigueScoreFor5JRulePARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckMaxFatigueScoreFor5JRule;

class CheckMaxFatigueScoreFor5JRuleParam : public RuleParam {
	friend class CheckMaxFatigueScoreFor5JRule;
private:
	explicit CheckMaxFatigueScoreFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7358;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 7;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		MAX_DUTY_FATIGUE = 4,
		FATIGUE_DISCRETION = 5,
		FATIGUE_DISCRETION_ATTRIBUTES = 6
	};

	//Crew的基地列表，支持|分开多个设置和*通配符
	std::vector<std::string> _bases{};
	//Crew的Rank列表，支持|分开多个设置和*通配符
	std::vector<std::string> _ranks{};
	//Crew的Fleet列表，支持|分开多个设置和*通配符
	std::vector<std::string> _fleets{};
	//Crew的Team列表，支持|分开多个设置和*通配符
	std::vector<std::string> _teams{};
	//满足条件Crew所在Roster最大疲劳值上限
	std::string _maxDutyFatigue{};
	double _maxDutyFatigueValue{};
	//格式double类型，如0.30，或者为空和 * （即没有扩展）
	double _fatigueDiscretion{ 0.0 };
	//启用Fatigue Discretion的Duty标签列表，支持 | 分开多个设置和 * 的通配符
	std::vector<std::string> _fatigueDiscretionAttributes{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	double GetDiscretion(const Duty* duty) const;

	bool MatchDutyAttributes(const Duty* duty) const;
};

#endif //_CheckMaxFatigueScoreFor5JRulePARAM_H_
