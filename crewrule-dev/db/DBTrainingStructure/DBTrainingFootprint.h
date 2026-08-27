//
// Created by haoli on 2026/3/29.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINT_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINT_H

class DBTrainingFootprint {
public:
    explicit DBTrainingFootprint(long long id) : _id(id) {}

    [[nodiscard]] long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

private:
    long long _id;
};

#endif //TRAININGOPTIMIZER_DBTRAININGFOOTPRINT_H
