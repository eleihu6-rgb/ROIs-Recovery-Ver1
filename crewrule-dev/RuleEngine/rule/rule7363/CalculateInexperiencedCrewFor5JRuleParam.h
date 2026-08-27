/**
 * @file CalculateInexperiencedCrewFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEINEXPERIENCEDCREWFOR5JRULEPARAM_H_
#define _CALCULATEINEXPERIENCEDCREWFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include <string>
#include <limits>

class CalculateInexperiencedCrewFor5JRule;


class CalculateInexperiencedCrewFor5JRuleParam : public RuleParam {
	friend class CalculateInexperiencedCrewFor5JRule;
private:
	explicit CalculateInexperiencedCrewFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7363;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 13;

	enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		AIRPORT_LIST = 5,
		BLH_RANGE = 6,
		MIN_AIRPORT_OPERATING = 7,
		MIN_OPERATING_LEG = 8
	};

	//所属基地。使用“|”分隔，表示多个值
	vector<std::string> _bases{};

	//人员级别。使用“|”分隔，表示多个值
	vector<std::string> _ranks{};

	//人员机型。使用“|”分隔，表示多个值
	vector<std::string> _fleets{};

	//团队。多个值使用“|”分隔并支持*通配
	vector<std::string> _teams{};

	//经历机场代码列表，支持 * 通配符和 | 分开多个列表。用于判断Crew在FDD之后需要访问这些机场的最小次数。
	vector<std::string> _airports{};

	//从FDD日期开始，必须满足累计飞时的区间。格式为HH:MM-HH:MM，条件为大于等于并且小于，其中HH至少支持2位到4位数字，如00:00-1000:01
	string _blhRange{};
	int _blhRangeLower{};
	int _blhRangeUpper{};

	//从FDD日期开始，执行航班访问上述机场的最小次数
	int _minAirportOperating{};

	//从FDD日期开始，执行FLY航班的最小次数
	int _minOperatingLeg{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

public:

	bool MatchParam(const Segment* segment) const;

	bool MatchAirport(const Segment* segment) const;

	bool MatchMinOperating(const int totalBlh, const int totalFltNum, const int totalAirportOperatingNum) const;

};

#endif //_CALCULATEINEXPERIENCEDCREWFOR5JRULEPARAM_H_
