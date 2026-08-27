/**
 * @file CalculateCourseFDPForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATECOURSEFDPFORTGRULEPARAM_H_
#define _CALCULATECOURSEFDPFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateCourseFDPForTGRule;

class CalculateCourseFDPForTGRuleParam : public RuleParam {
	friend class CalculateCourseFDPForTGRule;
private:
	explicit CalculateCourseFDPForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7278;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		COURSES = 0,
		FDP_PCT = 1,
		BEFORE_PCT_FDP_GAP = 2,
		AFTER_PCT_FDP_ACT = 3
	};

	std::vector<std::string> _courses{};

	double _fdpPct{};

	int _beforePctFdpGap{};

	int _afterPctFdpGap{};

	void ParseParam(const DBRule& dbRule);


public:

	bool MatchCourse(const SharedPtr<ROSTER>& roster) const;

	long GetRosterGroundFDP(const SharedPtr<ROSTER>& roster) const;

	long GetDutyFDP(const Duty* duty) const;

};

#endif //_CALCULATECOURSEFDPFORTGRULEPARAM_H_
