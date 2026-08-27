/**
 * @file CheckAcclimatizedRestRuleParamForEva.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKACCLIMATIZEDRESTRULEPARAMFOREVA_H_
#define _CHECKACCLIMATIZEDRESTRULEPARAMFOREVA_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckCourseDeviceAvailForEvaFdRule;

class CheckAcclimatizedRestRuleParamForEva : public RuleParam {
	friend class CheckAcclimatizedRestRuleForEva;
private:
	explicit CheckAcclimatizedRestRuleParamForEva(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7261;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		OUTSTATION_ACCLIMATIZED_CONDITION = 4,
		MIN_TIME_ZONE_GAP = 5,
		MIN_REST_AT_HOME_BASE = 6,
		OVERRIDE_ASSIGNMENT_GROUP = 7,
		OVERRIDE_EXCEPTION_TIME_ZONE_GAP = 8
	};

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	int _outstationAcclimatizedCondition{};

	int _minTimeZoneGap{};

	int _minRestAtHomeBase{};

	std::vector<std::string> _overrideExceptionAssignmentGroups{};

	int _overrideExceptionTimeZoneGap{};

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchParam(const ROSTER& roster) const;

	int CheckParam(const ROSTER& roster) const;

};

#endif //_CHECKACCLIMATIZEDRESTRULEPARAMFOREVA_H_
