/**
 * @file OvernightAtdoAtBaseForSQRuleParam.h
 * @brief Parameter model for rule 7424 (SQ overnight arrival ATDO at base).
 */

#ifndef RULEENGINE_RULE7424_OVERNIGHTATDOATBASEFORSQRULEPARAM_H_
#define RULEENGINE_RULE7424_OVERNIGHTATDOATBASEFORSQRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"

enum class Overnight7424DOStartsAfter {
    Transport,  // rest starts after debrief + transport (dropoff)
    Debrief,    // rest starts after debrief (transport counts as rest)
    DebriefNxdo // temporary: debrief-based and if exactly 00:00, align DO start to next day
};

struct Overnight7424ControlParam {
    Overnight7424DOStartsAfter doStartsAfter{Overnight7424DOStartsAfter::Transport};

    // Pairing service type filter: '*' (any), 'J' (passenger), 'F' (freighter).
    std::string serviceTypeUpper{"*"};

    // Fleet group filter: empty (any), otherwise require operating fleet group in this list.
    std::vector<std::string> fleetGroupsUpper{};
};

class OvernightAtdoAtBaseForSQRuleParam : public RuleParam {
public:
    explicit OvernightAtdoAtBaseForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseParam(const DBRule& dbRule);

    const std::string& GetClause() const { return _clause; }
    int GetAtdoDays() const { return _atdoDays; }

    bool HasOvernightArriveAfter() const { return _overnightArriveAfterSpecified; }
    int GetOvernightArriveAfterMinutes() const { return _overnightArriveAfterMinutes; }

    bool HasMinFdpMinutes() const { return _minFdpSpecified; }
    int GetMinFdpMinutes() const { return _minFdpMinutes; }

    bool HasFinalStartStations() const { return _finalStartStationsSpecified; }
    const std::vector<std::string>& GetFinalStartStationsUpper() const { return _finalStartStationsUpper; }

    bool IsValid() const;

private:
    static std::string NormalizeUpper(const std::string& value);
    static bool IsIgnoredToken(const std::string& valueUpper);
    static int ParseIntOrDefault(const std::string& value, int defaultValue);
    static bool ParseTimeMinutes(const std::string& value, int& outMinutes);
    static std::vector<std::string> SplitPipeUpper(const std::string& value);

    std::string _clause{};
    int _atdoDays{0};

    bool _overnightArriveAfterSpecified{false};
    int _overnightArriveAfterMinutes{0};

    bool _minFdpSpecified{false};
    int _minFdpMinutes{0};

    bool _finalStartStationsSpecified{false};
    std::vector<std::string> _finalStartStationsUpper{};
};

#endif  // RULEENGINE_RULE7424_OVERNIGHTATDOATBASEFORSQRULEPARAM_H_
