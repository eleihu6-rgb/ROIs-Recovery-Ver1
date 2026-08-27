/**
 * @file RestrictMidDutyBaseTurnRuleParam.h
 * @brief Rule parameters for SQ mid-duty base turn restriction (rule 7460).
 */
#ifndef _RESTRICTMIDDUTYBASETURNRULEPARAM_H_
#define _RESTRICTMIDDUTYBASETURNRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "violationcollector/ViolationTypeDefine.h"

class RestrictMidDutyBaseTurnRule;

class RestrictMidDutyBaseTurnRuleParam : public RuleParam {
    friend class RestrictMidDutyBaseTurnRule;
public:
    explicit RestrictMidDutyBaseTurnRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseParam(const std::string& paramString);

    void ParseParam(const DBRule& dbRule);

    bool Matches(const std::string& startStation, const std::string& endStation) const;

    int GetTotalNumberInPairing() const { return _totalNumberInPairing; }

private:
    struct MatchPattern {
        bool allowAny{true};
        bool isNegated{false};
        std::vector<std::string> values{};

        bool Matches(const std::string& candidate) const;
    };

    static MatchPattern BuildPattern(const std::string& rawValue);

    static std::string Normalize(const std::string& value);

    void ParseStartStation(const std::string& value);

    void ParseEndStation(const std::string& value);

    void ParseTotalNumberInPairing(const std::string& value);

    MatchPattern _startPattern{};
    MatchPattern _endPattern{};

    std::string _startRaw{};
    std::string _endRaw{};
    int _totalNumberInPairing{0};
};

#endif //_RESTRICTMIDDUTYBASETURNRULEPARAM_H_
