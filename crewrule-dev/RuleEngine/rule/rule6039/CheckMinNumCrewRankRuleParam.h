/**
 * @file CheckMinNumCrewRankRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMINNUMCREWRANKRULEPARAM_H_
#define _CHECKMINNUMCREWRANKRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMinNumCrewRankRule;

class CheckMinNumCrewRankRuleParam : public RuleParam {
friend class CheckMinNumCrewRankRule;
private:
    explicit CheckMinNumCrewRankRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6039;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		SEGMENT_ASSIGNMENTS = 0,
		CREW_RANKS = 1,
		MIN_NUMBER = 2,
		SEVERITY = 3
    };

	//Segment任务类型，支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _segmentAssignments{};

	//人员级别,多个值使用“|”分隔并支持*通配。
	std::string _strCrewRanks{};
	std::vector<std::string> _crewRanks{};

	//航班上Rank的最小人员数量,例如：1
	int _minNumber{1};
	
	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchSegmentAssignments(const Segment& segment, const std::shared_ptr<CREW>& crew) const;

public:
	bool MatchParam(const Segment& segment, const std::shared_ptr<CREW>& crew) const;

	bool MatchSegmentCrewNumber(const vector<shared_ptr<RosterFlight>>& rfs) const;
};

#endif //_CHECKMINNUMCREWRANKRULEPARAM_H_
