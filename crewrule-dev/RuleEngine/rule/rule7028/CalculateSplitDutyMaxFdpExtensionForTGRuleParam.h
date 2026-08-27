/**
 * @file CalculateSplitDutyMaxFdpExtensionForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATESPLITDUTYMAXFDPEXTENSIONFORTGRULEPARAM_H_
#define _CALCULATESPLITDUTYMAXFDPEXTENSIONFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/TimeRangeMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CalculateSplitDutyMaxFdpExtensionForTGRule;

class CalculateSplitDutyMaxFdpExtensionForTGRuleParam : public RuleParam {
	friend class CalculateSplitDutyMaxFdpExtensionForTGRule;
private:
	explicit CalculateSplitDutyMaxFdpExtensionForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7028;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 7;

	enum class ParamLocation {
		POST_FLIGHT_ASSIGNMENTS = 0,
		POST_FLIGHT_TIME = 1,
		PRE_FLIGHT_ASSIGNMENTS = 2,
		PRE_FLIGHT_TIME = 3,
		TRAVEL_TIME_TO_FROM_HOTEL = 4,
		MIN_SPLIT_DUTY_LENGTH = 5,
		MAX_SPLIT_DUTY_LENGTH = 6,
		EXTENSION_MAX_FDP_PCT = 7
	};

	//Post Segment任务类型，支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::string _postFlightAssignments{};
	AssignmentMatchExpression<Activity> _postFlightAssignmentsMatch;

	//前一个航班后需要扣除的时间，HH:MM -> Minutes
	std::string _dummyReleaseTime{};
	int _dummyReleaseTimeMinutes{};

	//Pre Segment任务类型，支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::string _preFlightAssignments{};
	AssignmentMatchExpression<Activity> _preFlightAssignmentsMatch;

	//后一个航班前需要扣除的时间，HH:MM -> Minutes
	std::string _dummyBriefTime{};
	int _dummyBriefTimeMinutes{};

	//来往酒店需要扣除的时间，HH:MM -> Minutes
	std::string _travelTimeToFromHotel{};
	int _travelTimeToFromHotelMinutes{};

	//最小的满足split duty的时间，HH:MM -> Minutes
	std::string _minSplitDutyLength{};
	int _minSplitDutyLengthMinutes{};

	//最大的满足split duty的时间，超过部分不计入，HH:MM -> Minutes
	std::string _maxSplitDutyLength{};
	int _maxSplitDutyLengthMinutes{};

	//扩展后最大FDP的pct
	std::string _extensionMaxFdpPct{};
	double _extensionMaxFdpPctValue{};


	void ParseParam(const DBRule& dbRule);

	bool MatchPostFlight(const Segment& segment) const;

	bool MatchPreFlight(const Segment& segment) const;

	int GetExtensionMaxFdpMinutes(const time_t start, const time_t end) const;

public:
	bool MatchParam(const Segment& postSegment, const Segment& preSegment) const;

};

#endif //_CALCULATESPLITDUTYMAXFDPEXTENSIONFORTGRULEPARAM_H_
