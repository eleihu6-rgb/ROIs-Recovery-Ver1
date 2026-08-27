/**
 * @file PostUlrRestAtBaseForSQRuleParam.h
 * @brief Parameter model for rule 7423 (SQ post-ULR minimum rest at base).
 */

#ifndef RULEENGINE_RULE7423_POSTULRRESTATBASEFORSQRULEPARAM_H_
#define RULEENGINE_RULE7423_POSTULRRESTATBASEFORSQRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"

enum class PostUlr7423RestStartsAfter {
    Transport,  // rest starts after debrief + transport (dropoff)
    Debrief,    // rest starts after debrief (transport counts as rest)
    DebriefNxdo // temporary: debrief-based and if exactly 00:00, align DO start to next day
};

enum class PostUlr7423YesNoAny {
    Any,
    Yes,
    No,
};

struct PostUlr7423ControlParam {
    PostUlr7423RestStartsAfter restStartsAfter{PostUlr7423RestStartsAfter::Transport};

    // Pairing service type filter: '*' (any), 'J' (passenger), 'F' (freighter).
    std::string serviceTypeUpper{"*"};

    // Pairing fleet filter: empty (any), otherwise require every operating segment fleet to be in this list.
    std::vector<std::string> fleetCodesUpper{};
};

class PostUlrRestAtBaseForSQRuleParam : public RuleParam {
public:
    explicit PostUlrRestAtBaseForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseParam(const DBRule& dbRule);

    const std::string& GetClause() const { return _clause; }

    int GetRestDays() const { return _restDays; }
    int GetRestHours() const { return _restHours; }
    int GetRestLocalNights() const { return _restLocalNights; }
    int GetFollowingDoAllowAfterMinutes() const { return _followingDoAllowAfterMinutes; }

    bool Matches(bool hasUlrDuty, bool hasPositionBackAfterUlr) const;
    int Specificity() const;

    bool IsValid() const;

private:
    static std::string NormalizeUpper(const std::string& value);
    static int ParseIntOrDefault(const std::string& value, int defaultValue);
    static int ParseTimeMinutes(const std::string& value);
    static PostUlr7423YesNoAny ParseYesNoAny(const std::string& value);

    std::string _clause{};
    PostUlr7423YesNoAny _hasUlrDuty{PostUlr7423YesNoAny::Yes};
    PostUlr7423YesNoAny _postUlrPositionBackToBase{PostUlr7423YesNoAny::Any};
    int _restDays{0};
    int _restHours{0};
    int _restLocalNights{0};
    int _followingDoAllowAfterMinutes{0};
};

#endif  // RULEENGINE_RULE7423_POSTULRRESTATBASEFORSQRULEPARAM_H_
