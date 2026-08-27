/**
 * @file CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMAXEARLYSTARTORLATEFINISHWITHINPERIODRULEPARAM_H_
#define _CHECKMAXEARLYSTARTORLATEFINISHWITHINPERIODRULEPARAM_H_


#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxEarlyStartOrLateFinishWithinPeriodRule;

class CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam : public RuleParam {
	friend class CheckMaxEarlyStartOrLateFinishWithinPeriodRule;
private:
	explicit CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7263;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		PERIOD = 4,
		UNIT = 5,
		MAX_LIMITS = 6,
		MIN_LIMITS = 7,
		CHECK_TYPE = 8,
		CHECK_MODE = 9,
		ASSIGNMENTS = 10
	};

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	//任务类型
	std::vector<std::string> _assignments{};

	int _period{};
	std::string _unit{};
	//最大次数
	int _maxLimits{};
	//最小次数
	int _minLimits{};
	//检查类型：Early Start || Late Finish || Early Start|Late Finish
	std::string _checkType{};
	//检查模式：F->flight, D->Duty, P->pairing
	std::string _checkMode{};

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchParam(const ROSTER& roster) const;

	int CheckParam(const ROSTER& roster) const;

	bool MatchAssignmentParam(const string& assignment) const;
};

#endif //_CHECKMAXEARLYSTARTORLATEFINISHWITHINPERIODRULEPARAM_H_
